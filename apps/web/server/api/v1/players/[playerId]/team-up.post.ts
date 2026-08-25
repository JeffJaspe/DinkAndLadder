import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createTeamUpRepository } from '~/server/domains/partnership/repositories/team-up.repository'
import {
  createTeamUpService,
  TeamUpServiceError
} from '~/server/domains/partnership/services/team-up.service'
import { apiError } from '~/server/utils/api-error'

/**
 * Ask a player to join your team — the roster of people you may register for an
 * open play session.
 *
 * Distinct from a duo partner request: this is directional and about bringing
 * someone to a session, not about pairing up for a doubles draw. A player can
 * reasonably be both, and neither implies the other.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in to build a team.')

  const memberPlayerId = getRouterParam(event, 'playerId')
  if (!memberPlayerId) throw apiError(400, 'VALIDATION_ERROR', 'A player id is required.')

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) throw apiError(403, 'PROFILE_REQUIRED', 'A player profile is required.')

  const body = await readBody<{ message?: string }>(event).catch(() => undefined)
  const service = createTeamUpService(createTeamUpRepository(serverSupabaseServiceRole(event)))

  try {
    const request = await service.invite(profile.id, memberPlayerId, body?.message)
    return { data: request, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof TeamUpServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[POST /api/v1/players/:id/team-up] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not send the team-up request.')
  }
})
