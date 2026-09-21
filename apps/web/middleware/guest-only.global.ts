import { RECOVERY_ROUTE, isGuestRoute } from '~/utils/route-groups'
import { isRecoveryLocked } from '~/utils/recovery-lock'
import { needsMfaChallenge } from '~/composables/useMfaChallenge'

/**
 * The signed-in half of route protection, which did not exist.
 *
 * `@nuxtjs/supabase`'s `redirectOptions.exclude` (nuxt.config.ts) is deny-by-
 * default for signed-*out* users only. Nothing bounced a signed-*in* user off
 * `/`, `/login` or `/register`, so URL navigation landed them on the marketing
 * page with the app sidebar drawn around it. `pages/index.vue` tried to handle
 * its own case inside `<script setup>`, but `useSupabaseUser()` is empty during
 * SSR and only fills in on the client, so the landing page painted first and
 * the redirect fired late — or, on a hard load, not at all. Middleware runs
 * before the page renders, which is the whole point.
 *
 * Runs on every route (`.global`), after `auth-callback-error.global.ts` —
 * alphabetical order, and an errored callback must be allowed to reach
 * /auth-error before anything else has an opinion.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // A recovery session is good for one thing. Trap it on the password form
  // until the password is actually set (or the user cancels, which signs out
  // and clears the lock). Client-only: sessionStorage is where the flag lives,
  // and the server pass cannot see it.
  if (import.meta.client && isRecoveryLocked() && to.path !== RECOVERY_ROUTE) {
    return navigateTo(RECOVERY_ROUTE, { replace: true })
  }

  const user = useSupabaseUser()
  if (!user.value) return

  // A user who still needs to complete MFA hasn't truly signed in yet.
  // Let them stay on guest routes (or sign out) rather than trapping them
  // in a redirect loop between /dashboard and /mfa/verify.
  if (import.meta.client && await needsMfaChallenge(useSupabaseClient())) {
    return
  }

  if (isGuestRoute(to.path)) {
    // If the user was in club mode, send them to that club's dashboard rather
    // than the player dashboard. The cookie persists across the auth flow.
    const activeClubId = useCookie<string | null>('active_club_id')
    const destination = activeClubId.value
      ? `/club/${activeClubId.value}/dashboard`
      : '/dashboard'

    // `replace` so Back does not bounce between /dashboard and the page they
    // were just redirected off.
    return navigateTo(destination, { replace: true })
  }
})
