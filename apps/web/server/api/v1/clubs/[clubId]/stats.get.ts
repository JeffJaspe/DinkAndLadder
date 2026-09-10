import { serverSupabaseClient } from '#supabase/server'
import { createAnalyticsService } from '~/server/domains/analytics/services/analytics.service'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'MISSING_PARAMETER', 'clubId is required.')
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)

  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const membershipRepo = createClubMembershipRepository(client)
  const membership = await membershipRepo.findByClubAndPlayer(clubId, profile.id)

  if (
    !membership ||
    membership.status !== 'active' ||
    !['OWNER', 'ADMIN'].includes(membership.role)
  ) {
    throw apiError(403, 'FORBIDDEN', 'Only club admins can view stats.')
  }

  const service = createAnalyticsService(client)
  const stats = await service.getClubStats(clubId)

  return stats
})
