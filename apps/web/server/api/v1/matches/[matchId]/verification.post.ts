import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import {
  createMatchService,
  MatchServiceError
} from '~/server/domains/match/services/match.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Starts verification for a submitted match: creates a pending match_verifications row for
 * every participant except the submitter, and moves matches.status to 'pending_verification'.
 * Uses the service-role client for the same reason as match submission — this writes rows for
 * OTHER players, which no self-service RLS policy can express. MatchService checks the caller
 * is actually a participant before the bypass is used.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to start match verification.')
  }

  const matchId = getRouterParam(event, 'matchId')
  if (!matchId) {
    throw apiError(400, 'VALIDATION_ERROR', 'matchId is required.')
  }

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(
      409,
      'PLAYER_PROFILE_REQUIRED',
      'Complete your player profile before verifying a match.'
    )
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createMatchService(createMatchRepository(serviceClient))

  try {
    const match = await service.initiateVerification(playerProfile.id, matchId)
    return { data: match, message: 'Verification started', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof MatchServiceError) throw apiError(err.status, err.code, err.message)
    console.error(
      `[POST /api/v1/matches/${matchId}/verification] initiateVerification failed:`,
      err
    )
    throw apiError(500, 'INTERNAL_ERROR', 'Could not start verification for this match.')
  }
})
