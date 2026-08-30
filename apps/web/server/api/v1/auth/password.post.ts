import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { readBody } from 'h3'
import { setPassword } from '~/server/domains/identity/services/auth.service'
import { mapAuthError } from '~/server/domains/identity/services/auth-error-mapper'
import { apiError } from '~/server/utils/api-error'
import type { SetPasswordRequestDto } from '~/server/domains/identity/dto/auth.dto'

/**
 * Sets (or replaces) the password on the signed-in user's account. The point is
 * account unification: a user created through "Continue with Google" has no
 * password identity, so email/password login rejects them even though the
 * account exists. Calling this attaches one to the *same* Supabase user, after
 * which both sign-in methods reach the same account.
 *
 * The user-scoped client, not service role: the session cookie is the
 * authorization, and this must never be able to change anyone else's password.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in before changing your password.')
  }

  const body = await readBody<Partial<SetPasswordRequestDto>>(event)
  // Mirrors the minlength on the register and update-password forms. Supabase
  // enforces its own project-level policy on top of this; the check is here so
  // an obviously-too-short password fails with our own message rather than a
  // provider one.
  if (!body?.password || body.password.length < 8) {
    throw apiError(400, 'VALIDATION_ERROR', 'Password must be at least 8 characters.')
  }

  const client = await serverSupabaseClient(event)
  const { error, code } = await setPassword(client, body.password)
  if (error) {
    const mapped = mapAuthError(code, error)
    throw apiError(400, mapped.code, mapped.message)
  }

  return {
    message: 'Password updated. You can now log in with your email and password.',
    request_id: crypto.randomUUID()
  }
})
