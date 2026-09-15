import { MFA_VERIFY_ROUTE, isMfaExemptRoute } from '~/utils/route-groups'

/**
 * Sends a password-only session on a two-factor account to the challenge.
 *
 * Courtesy only: the server middleware (server/middleware/mfa-gate.ts) is the
 * guard, and refuses the API to such a session whatever the browser shows.
 * This just makes sure the person sees the code prompt rather than a page
 * full of failed requests.
 *
 * Client-only, and read straight off the token: `getAuthenticatorAssuranceLevel`
 * decodes the access token in memory, no network. On the server pass the
 * Supabase client has no session state to decode, so the check would answer
 * "aal1, nothing to do" for everyone and be wrong for exactly the people it
 * exists for.
 *
 * Runs after guest-only.global.ts (alphabetical), so a signed-in user on a
 * guest route has already been sent to /dashboard - and then lands here.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  if (isMfaExemptRoute(to.path)) return

  const user = useSupabaseUser()
  if (!user.value) return

  if (await needsMfaChallenge(useSupabaseClient())) {
    return navigateTo(MFA_VERIFY_ROUTE, { replace: true })
  }
})
