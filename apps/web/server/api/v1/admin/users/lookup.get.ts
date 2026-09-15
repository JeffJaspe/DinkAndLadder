import { serverSupabaseServiceRole } from '#supabase/server'
import { getQuery } from 'h3'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { createUserRepository } from '~/server/domains/identity/repositories/user.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Finds one account by email for the SuperAdmin security console. Returns
 * only what the reset action needs to show: id, address, and whether 2FA is
 * on. SuperAdmin only (and, via the server middleware, aal2 only).
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in first.')

  const email = getQuery(event).email
  if (typeof email !== 'string' || !email.trim()) {
    throw apiError(400, 'VALIDATION_ERROR', 'email is required.')
  }

  const client = serverSupabaseServiceRole(event)
  const platformAdmin = createPlatformAdminService(createPlatformConfigRepository(client))
  if (!(await platformAdmin.isSuperAdmin(claims.sub))) {
    throw apiError(403, 'FORBIDDEN', 'Only the platform SuperAdmin can look up accounts.')
  }

  const user = await createUserRepository(client).findByEmail(email)
  if (!user) throw apiError(404, 'NOT_FOUND', 'No account has that email address.')

  return {
    data: {
      id: user.id,
      email: user.email,
      mfa_enrolled_at: user.mfa_enrolled_at,
      is_self: user.id === claims.sub
    }
  }
})
