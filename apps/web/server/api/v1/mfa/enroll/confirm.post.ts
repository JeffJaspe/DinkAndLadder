import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'
import {
  createMfaServiceFor,
  invalidateMfaEnrolledCache,
  requireAal2,
  unwrapMfaOutcome
} from '~/server/utils/mfa'

/**
 * Step two of the wizard, called after the browser has verified the code with
 * Supabase (which is what upgraded its session to aal2). Two independent
 * proofs are required before the account counts as enrolled: the session
 * must now carry `aal2`, and Supabase must list a verified TOTP factor. The
 * recovery codes come back here, and only here, exactly once.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in first.')
  requireAal2(claims)

  const { service, userClient } = await createMfaServiceFor(event)
  const outcome = await service.confirmEnrollment(userClient, claims.sub)
  // From this moment an aal1 session on this account is gated; do not let a
  // cached "not enrolled" outlive the change in this process.
  invalidateMfaEnrolledCache(claims.sub)

  return { data: unwrapMfaOutcome(outcome) }
})
