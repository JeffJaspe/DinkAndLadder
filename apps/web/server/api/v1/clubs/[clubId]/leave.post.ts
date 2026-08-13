import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubService, ClubServiceError } from '~/server/domains/club/services/club.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Self-service — club_memberships_update_own_leave's WITH CHECK (status = 'left') is what
 * actually restricts this to a leave, not a self-promotion; the user-scoped client suffices.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to leave a club.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }

  const client = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(404, 'NOT_FOUND', 'You have no player profile, so you cannot be a club member.')
  }

  const service = createClubService(
    createClubRepository(client),
    createClubMembershipRepository(client)
  )

  try {
    const membership = await service.leaveClub(clubId, playerProfile.id)
    return { data: membership, message: 'Left club', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ClubServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/clubs/${clubId}/leave] leaveClub failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not leave the club.')
  }
})
