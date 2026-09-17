import { serverSupabaseServiceRole } from '#supabase/server'
import { createKudosRepository } from '~/server/domains/kudos/repositories/kudos.repository'
import { createKudosService } from '~/server/domains/kudos/services/kudos.service'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

/**
 * What the reader may still do about kudos in this match.
 *
 * Answers "who can I credit, and who have I credited already" in one call, so
 * the match screen never has to work the eligibility rules out for itself — the
 * rules live in one place and the UI renders what it is told.
 *
 * A signed-out reader, or one who did not play, gets an empty, unremarkable
 * answer rather than an error: most people looking at a match page are not in
 * it.
 */
export default defineEventHandler(async (event) => {
  const matchId = getRouterParam(event, 'matchId')
  if (!matchId) throw apiError(400, 'MISSING_PARAMETER', 'matchId is required.')

  const claims = await getOptionalUser(event)
  if (!claims) {
    return { data: { eligible: [], given: [], unavailable_reason: null } }
  }

  const client = serverSupabaseServiceRole(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) {
    return { data: { eligible: [], given: [], unavailable_reason: null } }
  }

  const service = createKudosService(createKudosRepository(client), createMatchRepository(client))

  try {
    return { data: await service.forMatch(matchId, profile.id) }
  } catch (err) {
    console.error(`[GET /api/v1/matches/${matchId}/kudos] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load kudos for this match.')
  }
})
