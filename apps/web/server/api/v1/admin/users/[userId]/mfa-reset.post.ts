import { serverSupabaseServiceRole } from '#supabase/server'
import { getRouterParam } from 'h3'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { createAuditRepository } from '~/server/domains/audit/repositories/audit.repository'
import { createAuditService } from '~/server/domains/audit/services/audit.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'
import { createMfaServiceFor, invalidateMfaEnrolledCache, requireAal2 } from '~/server/utils/mfa'

/**
 * Removes every second factor from an account whose owner has lost both the
 * authenticator and the recovery codes. SuperAdmin only, and only from an
 * aal2 session (the server middleware already enforces that for /admin, the
 * explicit call is documentation). Audit-logged: this is the one action that
 * weakens someone else's account.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in first.')
  requireAal2(claims)

  const targetUserId = getRouterParam(event, 'userId')
  if (!targetUserId) throw apiError(400, 'VALIDATION_ERROR', 'User ID is required.')

  const client = serverSupabaseServiceRole(event)
  const platformAdmin = createPlatformAdminService(createPlatformConfigRepository(client))
  if (!(await platformAdmin.isSuperAdmin(claims.sub))) {
    throw apiError(403, 'FORBIDDEN', 'Only the platform SuperAdmin can reset two-factor authentication.')
  }
  if (targetUserId === claims.sub) {
    throw apiError(409, 'MFA_REQUIRED_ROLE', 'Use a recovery code for your own account; the SuperAdmin cannot switch off their own 2FA.')
  }

  const { service, adminClient } = await createMfaServiceFor(event)
  await service.adminReset(adminClient, targetUserId)
  invalidateMfaEnrolledCache(targetUserId)

  await createAuditService(createAuditRepository(client)).log({
    event_type: 'identity.mfa_admin_reset',
    actor_user_id: claims.sub,
    actor_player_id: null,
    target_type: 'user',
    target_id: targetUserId
  })

  return { message: 'Two-factor authentication was reset for that account.' }
})
