import { serverSupabaseServiceRole } from '#supabase/server'
import { createUserRepository } from '~/server/domains/identity/repositories/user.repository'
import { createAuthService } from '~/server/domains/identity/services/auth.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'
import { createMfaServiceFor, invalidateMfaEnrolledCache } from '~/server/utils/mfa'

/**
 * Called by the client right after Supabase Auth confirms a session, so the
 * app-level `users` row exists/is current. Uses the service-role client because
 * there is no INSERT policy on `users` — provisioning a brand-new row must
 * bypass RLS, but only from this trusted server context, never the client.
 *
 * Also the moment `users.mfa_enrolled_at` is reconciled with Supabase's factor
 * list: a factor enrolled from the mobile client, which talks to Supabase
 * directly, is enforced by the API gate from this sign-in on.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims?.email) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in before establishing a session.')
  }

  const client = serverSupabaseServiceRole(event)
  const service = createAuthService(createUserRepository(client))
  const user = await service.provisionSession({ id: claims.sub, email: claims.email })

  try {
    const mfa = await createMfaServiceFor(event)
    const enrolled = await mfa.service.syncEnrolledFlag(mfa.userClient, claims.sub)
    invalidateMfaEnrolledCache(claims.sub)
    user.mfa_enrolled_at = enrolled ? (user.mfa_enrolled_at ?? new Date().toISOString()) : null
  } catch (err) {
    // A factor listing failure must not stop someone signing in; the stored
    // flag stands until the next successful sync.
    console.error('[auth/session] could not sync MFA enrolment:', err)
  }

  return {
    data: user,
    message: 'Session established',
    request_id: crypto.randomUUID()
  }
})
