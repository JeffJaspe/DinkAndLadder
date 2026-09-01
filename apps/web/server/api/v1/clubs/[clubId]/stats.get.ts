import { serverSupabaseClient } from '#supabase/server'
import { createAnalyticsService } from '~/server/domains/analytics/services/analytics.service'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw createError({ statusCode: 400, statusMessage: 'clubId is required' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)

  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required' })
  }

  const membershipRepo = createClubMembershipRepository(client)
  const membership = await membershipRepo.findByClubAndPlayer(clubId, profile.id)

  if (
    !membership ||
    membership.status !== 'active' ||
    !['OWNER', 'ADMIN'].includes(membership.role)
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Only club admins can view stats' })
  }

  const service = createAnalyticsService(client)
  const stats = await service.getClubStats(clubId)

  return stats
})
