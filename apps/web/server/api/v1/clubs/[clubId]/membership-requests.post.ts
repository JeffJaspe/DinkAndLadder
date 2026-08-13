import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubService, ClubServiceError } from '~/server/domains/club/services/club.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Self-service — the user-scoped client is enough. club_memberships_insert_own's WITH
 * CHECK is what actually enforces "requests always start pending", not this controller.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to request to join a club.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }

  const client = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(
      409,
      'PLAYER_PROFILE_REQUIRED',
      'Complete your player profile before joining a club.'
    )
  }

  const service = createClubService(
    createClubRepository(client),
    createClubMembershipRepository(client)
  )

  try {
    const membership = await service.requestToJoin(clubId, playerProfile.id)
    return { data: membership, message: 'Membership requested', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ClubServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/clubs/${clubId}/membership-requests] requestToJoin failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not submit the membership request.')
  }
})
