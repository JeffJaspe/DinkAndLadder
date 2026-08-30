import { parseAuthCallbackError } from '~/utils/auth-callback-error'

/**
 * Traps a failed Supabase email link wherever it lands and routes it to
 * /auth-error, which explains what happened and offers a way forward.
 *
 * Without this the parameters are simply ignored: an expired reset link drops
 * the visitor on the marketing page with `?error=access_denied&
 * error_code=otp_expired` in the address bar and no indication anything failed.
 *
 * Client-only because half the parameters arrive in the URL fragment, which is
 * never sent to the server — `to.query` alone would miss them.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  if (to.path === '/auth-error') return

  const error = parseAuthCallbackError(to.query, window.location.hash)
  if (!error) return

  return navigateTo(
    { path: '/auth-error', query: { code: error.code, description: error.description } },
    { replace: true }
  )
})
