import { serverSupabaseClient } from '#supabase/server'
import { readBody } from 'h3'
import { registerWithPassword } from '~/server/domains/identity/services/auth.service'
import {
  EMAIL_ALREADY_REGISTERED,
  mapAuthError
} from '~/server/domains/identity/services/auth-error-mapper'
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
  // /confirm is the existing callback page and already matches
  // supabase.redirectOptions.callback in nuxt.config.ts.
  const siteUrl = useRuntimeConfig(event).siteUrl
  const { error, code, alreadyRegistered } = await registerWithPassword(
    client,
    body.email,
    body.password,
    siteUrl ? `${siteUrl.replace(/\/+$/, '')}/confirm` : undefined
  )
  if (error) {
    const mapped = mapAuthError(code, error)
    throw apiError(400, mapped.code, mapped.message)
  }
  // Supabase reports this one as a success (see registerWithPassword), but no
  // account was created and no email was sent, so returning the usual
  // "check your email" would strand the user waiting on nothing. Answering
  // truthfully does tell a caller that an address is taken — a deliberate
  // trade of Supabase's enumeration protection for a flow that isn't a dead
  // end. Turnstile already gates this endpoint, so probing it isn't free.
  if (alreadyRegistered) {
    throw apiError(409, EMAIL_ALREADY_REGISTERED.code, EMAIL_ALREADY_REGISTERED.message)
  }

  return {
    message: 'Check your email to confirm your account.',
    request_id: crypto.randomUUID()
  }
})
