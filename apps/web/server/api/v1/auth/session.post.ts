import { serverSupabaseServiceRole } from '#supabase/server'
import { createUserRepository } from '~/server/domains/identity/repositories/user.repository'
import { createAuthService } from '~/server/domains/identity/services/auth.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Called by the client right after Supabase Auth confirms a session, so the
 * app-level `users` row exists/is current. Uses the service-role client because
 * there is no INSERT policy on `users` — provisioning a brand-new row must
 * bypass RLS, but only from this trusted server context, never the client.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims?.email) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in before establishing a session.')
  }

  const client = serverSupabaseServiceRole(event)
  const service = createAuthService(createUserRepository(client))
  const user = await service.provisionSession({ id: claims.sub, email: claims.email })

  return {
    data: user,
    message: 'Session established',
    request_id: crypto.randomUUID()
  }
})
