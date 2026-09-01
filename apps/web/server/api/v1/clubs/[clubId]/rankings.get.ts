import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubService, ClubServiceError } from '~/server/domains/club/services/club.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Reuses ClubService.listRoster purely as the "is this caller an active member" gate — same
 * access rule as the members list — before running the ratings lookup with the service-role
 * client (player_ratings has no policy for "any active co-member of a shared club").
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view club rankings.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }

  const ratingType = getQuery(event).rating_type === 'doubles' ? 'doubles' : 'singles'
  const limit = Math.min(parseInt(getQuery(event).limit as string) || 10, 50)

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(403, 'FORBIDDEN', 'You have no player profile, so you cannot view this club.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const clubService = createClubService(
    createClubRepository(serviceClient),
    createClubMembershipRepository(serviceClient)
  )

  let roster
  try {
    roster = await clubService.listRoster(playerProfile.id, clubId)
  } catch (err) {
    if (err instanceof ClubServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[GET /api/v1/clubs/${clubId}/rankings] listRoster failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load club rankings.')
  }

  const activeMembers = roster.filter((m) => m.status === 'active')
  if (activeMembers.length === 0) {
    return { data: [], request_id: crypto.randomUUID() }
  }

  const displayNameByPlayerId = new Map(activeMembers.map((m) => [m.player_id, m.display_name]))
  const ratingRepo = createRatingRepository(serviceClient)
  const ratings = await ratingRepo.getRatingsForPlayers(
    activeMembers.map((m) => m.player_id),
    ratingType
  )

  const mapped = ratings
    .slice()
    .sort((a, b) => (b.rating_value ?? 0) - (a.rating_value ?? 0))
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      player_id: r.player_id,
      display_name: displayNameByPlayerId.get(r.player_id) ?? 'Unknown',
      rating_value: r.rating_value
    }))

  return { data: mapped, request_id: crypto.randomUUID() }
})
