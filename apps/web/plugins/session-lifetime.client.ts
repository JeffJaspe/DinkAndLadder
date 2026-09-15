import { REMEMBER_ME_COOKIE, findAuthCookies, sessionCookieString } from '~/utils/remember-me'

/**
 * Makes closing the browser sign you out, unless you asked to be remembered.
 *
 * @supabase/ssr writes every auth cookie with a 400-day Max-Age and ignores
 * the `maxAge` the Nuxt module passes it (cookies.js: `maxAge:
 * DEFAULT_COOKIE_OPTIONS.maxAge` is spread *after* the options), so there is
 * no configuration that yields a session cookie. This plugin does the next
 * best thing: whenever the auth cookies could have been written — an auth
 * state change in this tab, or a page whose SSR pass may have refreshed the
 * token and sent Set-Cookie — it reads them back and rewrites each one with
 * the same value and no expiry. Same name, path and flags, so it is a
 * replacement, not a sibling.
 *
 * With the remember-me cookie present nothing is touched and the long expiry
 * stands; the real lifetime is then Supabase's refresh-token policy.
 *
 * Browsers that restore the previous session on launch ("continue where you
 * left off") keep session cookies too. That is the browser's choice and the
 * same for every site; nothing here can override it.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const { cookiePrefix, cookieOptions } = useRuntimeConfig().public.supabase
  const remembered = useCookie<string | null>(REMEMBER_ME_COOKIE)

  function demoteToSessionCookies() {
    if (remembered.value) return
    for (const cookie of findAuthCookies(document.cookie, cookiePrefix)) {
      document.cookie = sessionCookieString(cookie, {
        // Nuxt types sameSite as string | boolean; the module only ever sets a string.
        sameSite: typeof cookieOptions.sameSite === 'string' ? cookieOptions.sameSite : undefined,
        secure: cookieOptions.secure
      })
    }
  }

  const supabase = useSupabaseClient()
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      demoteToSessionCookies()
    }
  })

  // After every navigation, including the first: the SSR pass can refresh
  // the token and answer with a long-lived Set-Cookie that no client-side
  // auth event announces.
  nuxtApp.hook('page:finish', demoteToSessionCookies)
  demoteToSessionCookies()
})
