import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Returns the current user's membership request status for this club.
 * Used by the UI to determine whether to show the "Request to Join" button
 * or a "Pending" message.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    // Not logged in - can't have a pending request
    return { pending: false, status: null }
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }

  const client = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!playerProfile) {
    // No player profile - can't have a pending request
    return { pending: false, status: null }
  }

  const membershipRepo = createClubMembershipRepository(client)
  const membership = await membershipRepo.findByClubAndPlayer(clubId, playerProfile.id)

  return {
    pending: membership?.status === 'pending',
    status: membership?.status ?? null
  }
})
