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
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
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
  const playerRepo = createPlayerProfileRepository(userClient)
  const playerProfile = await playerRepo.findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(
      409,
      'PLAYER_PROFILE_REQUIRED',
      'Complete your player profile before verifying a match.'
    )
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createMatchService(createMatchRepository(serviceClient))
  const notificationService = createNotificationService(
    createNotificationRepository(serviceClient)
  )
  const servicePlayerRepo = createPlayerProfileRepository(serviceClient)

  try {
    const match = await service.initiateVerification(playerProfile.id, matchId)

    const verifierNotifications = await Promise.all(
      match.verifications
        .filter((v) => v.status === 'pending')
        .map(async (v) => {
          const profile = await servicePlayerRepo.findById(v.verifier_player_id)
          if (!profile) return null
          return {
            user_id: profile.user_id,
            type: 'match.verification_requested' as const,
            title: 'Verification Requested',
            body: `Please verify a ${match.match_type} match you participated in.`,
            reference_type: 'match' as const,
            reference_id: matchId
          }
        })
    )

    await notificationService.notifyMany(
      verifierNotifications.filter((n): n is NonNullable<typeof n> => n !== null)
    )

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
