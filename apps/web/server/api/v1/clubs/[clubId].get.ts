import { serverSupabaseClient } from '#supabase/server'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubService } from '~/server/domains/club/services/club.service'
import { apiError } from '~/server/utils/api-error'

/** No auth required — visibility is enforced by the clubs RLS policies. */
export default defineEventHandler(async (event) => {
  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }

  const client = await serverSupabaseClient(event)
  const service = createClubService(
    createClubRepository(client),
    createClubMembershipRepository(client)
  )
  const club = await service.getClub(clubId)

  if (!club) {
    throw apiError(404, 'NOT_FOUND', 'No club found with that id.')
  }

  return club
})
