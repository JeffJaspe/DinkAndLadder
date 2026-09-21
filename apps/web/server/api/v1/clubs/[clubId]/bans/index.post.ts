import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createClubBanRepository } from '~/server/domains/club/repositories/club-ban.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { apiError } from '~/server/utils/api-error'

interface BanInput {
  player_id: string
  reason?: string
}

/**
 * Ban a player from the club's events.
 * Only club admins/owners can ban players.
 */
export default defineEventHandler(async (event) => {
  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) throw apiError(400, 'MISSING_PARAM', 'clubId is required')

  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(401, 'UNAUTHORIZED', 'Sign in required')

  const body = await readBody<BanInput>(event)
  if (!body?.player_id) {
    throw apiError(400, 'MISSING_PARAM', 'player_id is required')
  }

  if (body.player_id === user.id) {
    throw apiError(400, 'INVALID_INPUT', 'You cannot ban yourself')
  }

  const client = await serverSupabaseClient(event)
  const memberships = createClubMembershipRepository(client)

  const membership = await memberships.findByClubAndPlayer(clubId, user.id)
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    throw apiError(403, 'FORBIDDEN', 'Only club admins can ban players')
  }

  const targetMembership = await memberships.findByClubAndPlayer(clubId, body.player_id)
  if (targetMembership?.role === 'OWNER') {
    throw apiError(400, 'INVALID_INPUT', 'Cannot ban a club owner')
  }

  const bans = createClubBanRepository(client)

  const existing = await bans.findByClubAndPlayer(clubId, body.player_id)
  if (existing) {
    throw apiError(409, 'ALREADY_BANNED', 'This player is already banned from this club')
  }

  const ban = await bans.create({
    club_id: clubId,
    player_id: body.player_id,
    banned_by: user.id,
    reason: body.reason
  })

  return { ban }
})
