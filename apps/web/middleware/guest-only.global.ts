import { RECOVERY_ROUTE, isGuestRoute } from '~/utils/route-groups'
import { isRecoveryLocked } from '~/utils/recovery-lock'

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
export default defineNuxtRouteMiddleware((to) => {
  // A recovery session is good for one thing. Trap it on the password form
  // until the password is actually set (or the user cancels, which signs out
  // and clears the lock). Client-only: sessionStorage is where the flag lives,
  // and the server pass cannot see it.
  if (import.meta.client && isRecoveryLocked() && to.path !== RECOVERY_ROUTE) {
    return navigateTo(RECOVERY_ROUTE, { replace: true })
  }

  const user = useSupabaseUser()
  if (!user.value) return

  if (isGuestRoute(to.path)) {
    // `replace` so Back does not bounce between /dashboard and the page they
    // were just redirected off.
    return navigateTo('/dashboard', { replace: true })
  }
})
