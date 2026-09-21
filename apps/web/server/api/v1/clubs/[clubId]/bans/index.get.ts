import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createClubBanRepository } from '~/server/domains/club/repositories/club-ban.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * List banned players for a club.
 * Only club admins/owners can view the full list.
 */
export default defineEventHandler(async (event) => {
  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) throw apiError(400, 'MISSING_PARAM', 'clubId is required')

  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(401, 'UNAUTHORIZED', 'Sign in required')

  const client = await serverSupabaseClient(event)
  const memberships = createClubMembershipRepository(client)

  const membership = await memberships.findByClubAndPlayer(clubId, user.id)
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    throw apiError(403, 'FORBIDDEN', 'Only club admins can view banned players')
  }

  const bans = createClubBanRepository(client)
  const list = await bans.listByClub(clubId)

  return { bans: list }
})
