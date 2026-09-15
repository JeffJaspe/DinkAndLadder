import { REMEMBER_ME_COOKIE, REMEMBER_ME_MAX_AGE } from '~/utils/remember-me'

const OPTED_IN_NO_EMAIL = '1'

/**
 * The "remember me" choice, readable on both passes.
 *
 * `useCookie` rather than localStorage so the SSR pass and the session
 * lifetime plugin read the same thing, and so the login form can prefill
 * before hydration instead of after a flash of empty field.
 */
export function useRememberMe() {
  const cookie = useCookie<string | null>(REMEMBER_ME_COOKIE, {
    default: () => null,
    maxAge: REMEMBER_ME_MAX_AGE,
    sameSite: 'lax',
    // useCookie JSON-decodes by default, which turns the "1" sentinel into the
    // number 1 — and then `rememberedEmail` hands a number to `remember()`.
    // The value is only ever a plain string; keep it one.
    encode: (value) => (value == null ? '' : encodeURIComponent(String(value))),
    decode: (value) => (value === '' ? null : decodeURIComponent(value))
  })

  const isRemembered = computed(() => Boolean(cookie.value))
  // "1" is opted in with no address to prefill — the Google path, where the
  // address is Google's to tell us.
  const rememberedEmail = computed(() =>
    cookie.value && cookie.value !== OPTED_IN_NO_EMAIL ? cookie.value : ''
  )

  /** Opt in, for this address when there is one. */
  function remember(email?: string) {
    const trimmed = typeof email === 'string' ? email.trim() : ''
    cookie.value = trimmed || OPTED_IN_NO_EMAIL
  }

  /** Opt out: nothing kept, and the auth cookies become session cookies. */
  function forget() {
    cookie.value = null
  }

  return { isRemembered, rememberedEmail, remember, forget }
}
