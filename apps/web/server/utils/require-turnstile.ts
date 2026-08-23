import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'
import { verifyTurnstileToken, type TurnstileFetcher } from './turnstile'
import { apiError } from './api-error'

/**
 * Enforces Cloudflare Turnstile on an auth endpoint.
 *
 * Previously each handler wrapped the check in `if (turnstileSecretKey) { ... }`.
 * verifyTurnstileToken itself fails closed, but that branch meant it was never
 * reached when the key was unset — so a single missing environment variable
 * silently removed all bot protection from login and registration, with no log
 * line and no startup assertion.
 *
 * Now a missing key is only tolerated in dev, and loudly. Anywhere else it is a
 * misconfiguration and the request fails rather than proceeding unprotected.
 */
export async function requireTurnstile(event: H3Event, token: string | undefined): Promise<void> {
  const { turnstileSecretKey } = useRuntimeConfig(event)

  if (!turnstileSecretKey) {
    if (import.meta.dev) {
      console.warn(
        '[turnstile] TURNSTILE_SECRET_KEY is not set — bot verification is DISABLED. ' +
          'This is allowed in dev only; a production build will reject these requests.'
      )
      return
    }
    console.error('[turnstile] TURNSTILE_SECRET_KEY is not configured — refusing the request.')
    throw apiError(
      500,
      'TURNSTILE_NOT_CONFIGURED',
      'Bot verification is unavailable. Please try again later.'
    )
  }

  // Cast (not just annotate) to sidestep TS trying to structurally reconcile
  // Nitro's route-literal-typed $fetch against the plain TurnstileFetcher
  // signature, which blows the type-checker's recursion depth.
  const fetchJson = $fetch as unknown as TurnstileFetcher
  const verification = await verifyTurnstileToken(
    fetchJson,
    turnstileSecretKey,
    token,
    getRequestIP(event)
  )

  if (!verification.success) {
    throw apiError(
      403,
      'TURNSTILE_VERIFICATION_FAILED',
      'Bot verification failed. Please try again.'
    )
  }
}
