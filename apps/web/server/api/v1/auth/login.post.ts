import { serverSupabaseClient } from '#supabase/server'
import { readBody } from 'h3'
import { loginWithPassword } from '~/server/domains/identity/services/auth.service'
import { mapAuthError } from '~/server/domains/identity/services/auth-error-mapper'
import { requireTurnstile } from '~/server/utils/require-turnstile'
import { apiError } from '~/server/utils/api-error'
import type { LoginRequestDto } from '~/server/domains/identity/dto/auth.dto'

/**
 * Runs signInWithPassword server-side (instead of directly from the browser)
 * so Turnstile bot verification can be enforced before credentials are ever
 * checked. Returns the raw session tokens — the client must call
 * supabase.auth.setSession() with them (see pages/login.vue) so
 * @nuxtjs/supabase's reactive session state actually updates; the cookies
 * this response also sets (via serverSupabaseClient's cookie adapter) only
 * cover subsequent server-side requests, not client-side route guards.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<LoginRequestDto>>(event)
  if (!body?.email || !body?.password) {
    throw apiError(400, 'VALIDATION_ERROR', 'email and password are required.')
  }

  await requireTurnstile(event, body.turnstile_token)

  const client = await serverSupabaseClient(event)
  const { error, code, session } = await loginWithPassword(client, body.email, body.password)
  if (error) {
    const mapped = mapAuthError(code, error)
    throw apiError(401, mapped.code, mapped.message)
  }

  return {
    message: 'Signed in',
    request_id: crypto.randomUUID(),
    // The client must call supabase.auth.setSession() with this — see the
    // comment on loginWithPassword for why cookies alone aren't enough.
    session
  }
})
