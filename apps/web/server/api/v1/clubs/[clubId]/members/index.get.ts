import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubService, ClubServiceError } from '~/server/domains/club/services/club.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Listing the full roster (everyone's rows, not just the caller's own) needs the
 * service-role client — club_memberships only has a select-your-own-row RLS policy.
 * ClubService.listRoster checks the caller is an active member before returning anything.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view this club roster.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(403, 'FORBIDDEN', 'You have no player profile, so you cannot view this roster.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createClubService(
    createClubRepository(serviceClient),
    createClubMembershipRepository(serviceClient)
  )

  try {
    const roster = await service.listRoster(playerProfile.id, clubId)
    return {
      items: roster,
      page: 1,
      page_size: roster.length,
      total: roster.length,
      has_next: false
    }
  } catch (err) {
    if (err instanceof ClubServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[GET /api/v1/clubs/${clubId}/members] listRoster failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not list club members.')
  }
})
