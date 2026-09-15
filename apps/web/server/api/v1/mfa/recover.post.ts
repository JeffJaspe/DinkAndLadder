import { serverSupabaseClient } from '#supabase/server'
import { readBody } from 'h3'
import { apiError } from '~/server/utils/api-error'
import { requireTurnstile } from '~/server/utils/require-turnstile'
import {
  createMfaServiceFor,
  invalidateMfaEnrolledCache,
  unwrapMfaOutcome
} from '~/server/utils/mfa'
import type { MfaRecoverRequestDto } from '~/server/domains/identity/dto/mfa.dto'

/**
 * Lost authenticator. Password + one unused recovery code removes every
 * factor and returns an aal1 session so the owner can get in and enrol again
 * (the client calls setSession with it, as login.vue does).
 *
 * Signed-out endpoint, so it sits behind Turnstile like /auth/login. It gives
 * one answer to every failure - the service makes sure of that - and on
 * success it also identifies the account for the cache.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<MfaRecoverRequestDto>>(event)
  if (!body?.email || !body?.password || !body?.recovery_code) {
    throw apiError(400, 'VALIDATION_ERROR', 'email, password and recovery_code are required.')
  }

  await requireTurnstile(event, body.turnstile_token)

  const { service, adminClient } = await createMfaServiceFor(event)
  const authClient = await serverSupabaseClient(event)
  const outcome = await service.recover(
    authClient,
    adminClient,
    body.email,
    body.password,
    body.recovery_code
  )
  const value = unwrapMfaOutcome(outcome, 401)

  // Drop the gate's memo so the fresh aal1 session is not refused for up to 30 s.
  invalidateMfaEnrolledCache(value.user_id)

  return {
    message: 'Two-factor authentication was reset. Set it up again now.',
    session: value.session
  }
})
