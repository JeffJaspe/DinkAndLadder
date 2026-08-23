import { serverSupabaseClient } from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'

export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw createError({ statusCode: 400, statusMessage: 'playerId is required.' })
  }

  const client = await serverSupabaseClient(event)
  const membershipRepo = createClubMembershipRepository(client)

  const memberships = await membershipRepo.listOwnWithClub(playerId)

  const items = memberships
    .filter((m) => m.status === 'active')
    .map((m) => ({
      club: {
        id: m.club.id,
        name: m.club.name,
        is_verified: m.club.verification_status === 'verified'
      }
    }))

  return { items }
})
