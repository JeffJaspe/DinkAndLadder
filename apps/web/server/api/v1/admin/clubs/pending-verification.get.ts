import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import {
  createClubVerificationService,
  ClubVerificationServiceError
} from '~/server/domains/club/services/club-verification.service'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view pending club verifications.')
  }

  const client = serverSupabaseServiceRole(event)
  const service = createClubVerificationService(
    createClubRepository(client),
    createClubMembershipRepository(client),
    createPlatformAdminService(createPlatformConfigRepository(client))
  )

  try {
    const clubs = await service.listPendingVerification(claims.sub)
    return { data: clubs, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ClubVerificationServiceError)
      throw apiError(err.status, err.code, err.message)
    console.error('[GET /api/v1/admin/clubs/pending-verification] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not list pending club verifications.')
  }
})
