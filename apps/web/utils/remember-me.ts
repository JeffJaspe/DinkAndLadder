/**
 * "Remember me" — the one switch between two session lifetimes.
 *
 * Off (the default): the Supabase auth cookies are rewritten as *session*
 * cookies, which the browser discards when it is closed. Closing the browser
 * is signing out.
 *
 * On: the cookies keep the long expiry the auth library writes, and the
 * address used to sign in is kept so the login form is one field short next
 * time.
 *
 * The choice lives in one long-lived cookie whose value is the remembered
 * email — its presence is the opt-in. It is deliberately not the auth cookie
 * and holds nothing that signs anyone in.
 *
 * Pure helpers here, so the cookie parsing and the rewrite can be tested
 * without a browser. The browser-facing half is plugins/session-lifetime.client.ts.
 */

/** Presence = opted in; value = the email to prefill. */
export const REMEMBER_ME_COOKIE = 'dnl_remember'

/** Chrome's ceiling; anything longer is clamped to this anyway. */
export const REMEMBER_ME_MAX_AGE = 400 * 24 * 60 * 60

export interface CookiePair {
  name: string
  value: string
}

/**
 * Every cookie whose name starts with the auth prefix, as the browser holds it.
 *
 * `document.cookie` is `name=value; name=value`, values already encoded the
 * way the auth library wrote them. They are passed back verbatim, never
 * decoded, so the rewrite is byte-for-byte the same cookie with a different
 * lifetime.
 */
export function findAuthCookies(cookieHeader: string, prefix: string): CookiePair[] {
  if (!cookieHeader) return []
  const pairs: CookiePair[] = []
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (!name.startsWith(prefix)) continue
    pairs.push({ name, value: part.slice(eq + 1).trim() })
  }
  return pairs
}

export interface SessionCookieAttributes {
  sameSite?: string
  secure?: boolean
  path?: string
}

/**
 * The same cookie, with no Max-Age and no Expires — which is what makes it a
 * session cookie. Path, SameSite and Secure mirror what the auth library used
 * so the write replaces the cookie rather than sitting beside it.
 */
export function sessionCookieString(
  cookie: CookiePair,
  attributes: SessionCookieAttributes = {}
): string {
  const parts = [`${cookie.name}=${cookie.value}`, `Path=${attributes.path ?? '/'}`]
  const sameSite = attributes.sameSite ?? 'lax'
  parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`)
  if (attributes.secure) parts.push('Secure')
  return parts.join('; ')
}
