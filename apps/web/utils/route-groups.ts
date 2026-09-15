/**
 * Which routes sit *outside* the signed-in app.
 *
 * This existed nowhere before, and the absence was the bug: `nuxt.config.ts`
 * lists public routes for `@nuxtjs/supabase` (which only ever redirects signed
 * *out* users), while `layouts/default.vue` decided whether to draw the whole
 * app shell from `useSupabaseUser()` alone and never looked at the route. So a
 * signed-in visitor got the sidebar wrapped around the marketing page, and a
 * password-recovery session got it wrapped around the password form — with
 * every nav link a way out of the flow, password still unchanged.
 *
 * One list, read by `middleware/guest-only.global.ts` and by the layout, so the
 * two cannot drift apart again.
 */

/**
 * Routes a signed-in user has no business on: they are bounced to /dashboard.
 *
 * `/confirm` and `/auth-error` are deliberately absent — both are *arrived at*
 * with a session in hand (or in the middle of getting one) and have to be
 * allowed to finish their job. They are chromeless, not guest-only.
 */
export const GUEST_ROUTES: readonly string[] = [
  '/',
  '/login',
  '/register',
  '/check-email',
  '/reset-password'
]

/**
 * The recovery form. Not guest-only: the recovery token *is* a session, so
 * bouncing every authenticated visitor would make the page unreachable by the
 * only people who need it. It is guarded by intent instead — see
 * `utils/recovery-lock.ts`.
 */
export const RECOVERY_ROUTE = '/update-password'

/**
 * The two-factor pages. `/mfa/verify` is reached with an aal1 session that is
 * not yet allowed anywhere else; `/mfa/recover` with no session at all. Both
 * are the second half of signing in and get the sign-in treatment: no shell,
 * never bounced by the MFA route guard (which would loop).
 */
export const MFA_VERIFY_ROUTE = '/mfa/verify'
export const MFA_RECOVER_ROUTE = '/mfa/recover'

/** Routes that must never render the app shell, whoever is signed in. */
const CHROMELESS_ROUTES: readonly string[] = [
  ...GUEST_ROUTES,
  RECOVERY_ROUTE,
  MFA_VERIFY_ROUTE,
  MFA_RECOVER_ROUTE,
  '/auth-error',
  '/confirm'
]

/**
 * Where an aal1 session on an enrolled account may still go without being
 * sent to the challenge: the challenge itself, recovery, and the pages that
 * exist for people who are not signed in anyway.
 */
export function isMfaExemptRoute(path: string): boolean {
  return isChromelessRoute(path)
}

/** `/login/` and `/login` are the same route; `/` must survive the trim. */
function normalize(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

export function isGuestRoute(path: string): boolean {
  return GUEST_ROUTES.includes(normalize(path))
}

export function isChromelessRoute(path: string): boolean {
  return CHROMELESS_ROUTES.includes(normalize(path))
}
