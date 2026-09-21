import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createClubBanRepository } from '~/server/domains/club/repositories/club-ban.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Unban a player from the club.
 * Only club admins/owners can unban players.
 */
export default defineEventHandler(async (event) => {
  const clubId = getRouterParam(event, 'clubId')
  const playerId = getRouterParam(event, 'playerId')
  if (!clubId) throw apiError(400, 'MISSING_PARAM', 'clubId is required')
  if (!playerId) throw apiError(400, 'MISSING_PARAM', 'playerId is required')

  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(401, 'UNAUTHORIZED', 'Sign in required')

  const client = await serverSupabaseClient(event)
  const memberships = createClubMembershipRepository(client)

  const membership = await memberships.findByClubAndPlayer(clubId, user.id)
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    throw apiError(403, 'FORBIDDEN', 'Only club admins can unban players')
  }

  const bans = createClubBanRepository(client)

  const existing = await bans.findByClubAndPlayer(clubId, playerId)
  if (!existing) {
    throw apiError(404, 'NOT_FOUND', 'This player is not banned from this club')
  }

  await bans.deleteByClubAndPlayer(clubId, playerId)

  return { success: true }
})
