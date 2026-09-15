import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'
import { createMfaServiceFor, unwrapMfaOutcome } from '~/server/utils/mfa'
import { mapAuthError } from '~/server/domains/identity/services/auth-error-mapper'

/**
 * Step one of the wizard: a fresh TOTP factor and the QR to scan. The secret
 * comes back exactly once and is not logged anywhere on this path.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in first.')

  const { service, userClient } = await createMfaServiceFor(event)
  const outcome = await service.startEnrollment(userClient)
  if (!outcome.ok && outcome.provider?.code) {
    // Supabase's own reason (e.g. TOTP not enabled on the project) is more
    // useful than our generic one when it has a stable code.
    const mapped = mapAuthError(outcome.provider.code, outcome.message)
    if (mapped.code !== 'AUTH_ERROR') throw apiError(400, mapped.code, mapped.message)
  }
  return { data: unwrapMfaOutcome(outcome) }
})
