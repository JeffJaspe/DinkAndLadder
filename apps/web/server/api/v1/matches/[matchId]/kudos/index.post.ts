import { serverSupabaseServiceRole } from '#supabase/server'
import { createKudosRepository } from '~/server/domains/kudos/repositories/kudos.repository'
import {
  createKudosService,
  KudosServiceError
} from '~/server/domains/kudos/services/kudos.service'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'
import type { KudosSkill } from '~/server/domains/kudos/dto/kudos.dto'

interface GiveKudosBody {
  to_player_id?: string
  skill?: KudosSkill
}

/**
 * Credit an opponent with one skill for this match.
 *
 * Service role: the eligibility check has to read the match's participants to
 * establish who was on the other side, and `match_participants` admits only the
 * people who played — which is precisely the fact being checked. The player id
 * comes from the verified token, and `match_kudos` has no INSERT policy at all,
 * so this handler is the only way a row is ever written.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in to give kudos.')

  const matchId = getRouterParam(event, 'matchId')
  if (!matchId) throw apiError(400, 'MISSING_PARAMETER', 'matchId is required.')

  const body = await readBody<GiveKudosBody>(event).catch(() => undefined)
  if (!body?.to_player_id || !body?.skill) {
    throw apiError(400, 'VALIDATION_ERROR', 'to_player_id and skill are both required.')
  }

  const client = serverSupabaseServiceRole(event)

  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')

  const service = createKudosService(createKudosRepository(client), createMatchRepository(client))

  try {
    const kudos = await service.give(profile.id, {
      match_id: matchId,
      to_player_id: body.to_player_id,
      skill: body.skill
    })
    return { data: kudos }
  } catch (err) {
    if (err instanceof KudosServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/matches/${matchId}/kudos] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not record the kudos.')
  }
})
