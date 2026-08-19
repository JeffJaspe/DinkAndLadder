import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import {
  createClubVerificationService,
  ClubVerificationServiceError
} from '~/server/domains/club/services/club-verification.service'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Service-role throughout, same reasoning as PATCH /api/v1/clubs/{clubId}: clubs has no
 * UPDATE RLS policy by design. Owner-only authorization is checked in the service, not
 * skipped by this bypass.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to request club verification.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }

  const client = serverSupabaseServiceRole(event)
  const playerProfile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(403, 'FORBIDDEN', 'You have no player profile, so you cannot own a club.')
  }

  const service = createClubVerificationService(
    createClubRepository(client),
    createClubMembershipRepository(client),
    createPlatformAdminService(createPlatformConfigRepository(client))
  )

  try {
    const club = await service.requestVerification(playerProfile.id, clubId)
    return { data: club, message: 'Verification requested', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ClubVerificationServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/clubs/${clubId}/request-verification] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not request verification.')
  }
})
