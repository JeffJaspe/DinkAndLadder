import { serverSupabaseClient } from '#supabase/server'
import { readBody } from 'h3'
import { registerWithPassword } from '~/server/domains/identity/services/auth.service'
import { mapAuthError } from '~/server/domains/identity/services/auth-error-mapper'
import { requireTurnstile } from '~/server/utils/require-turnstile'
import { apiError } from '~/server/utils/api-error'
import type { RegisterRequestDto } from '~/server/domains/identity/dto/auth.dto'

/**
 * Runs signUp server-side (instead of directly from the browser) so Turnstile
 * bot verification can be enforced before the auth provider is ever called.
 * Still delegates the actual signUp/confirmation-email flow to Supabase —
 * only the trigger point moved server-side, not the flow itself.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<RegisterRequestDto>>(event)
  if (!body?.email || !body?.password) {
    throw apiError(400, 'VALIDATION_ERROR', 'email and password are required.')
  }

  await requireTurnstile(event, body.turnstile_token)

  const client = await serverSupabaseClient(event)
  const { error, code } = await registerWithPassword(client, body.email, body.password)
  if (error) {
    const mapped = mapAuthError(code, error)
    throw apiError(400, mapped.code, mapped.message)
  }

  return {
    message: 'Check your email to confirm your account.',
    request_id: crypto.randomUUID()
  }
})
