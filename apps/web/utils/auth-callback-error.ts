/**
 * Supabase reports a failed email link by redirecting the browser to an app URL
 * carrying `error`, `error_code` and `error_description` — in the query string
 * *and* repeated in the fragment. The target is whatever `redirect_to` was
 * allowed, falling back to the project's Site URL, so these land on whichever
 * page that happens to be. On the landing page they are invisible: the app
 * renders normally and the person is left assuming the link simply did nothing.
 *
 * Pure so the parsing can be unit-tested away from the router: the middleware
 * supplies the two sources, this decides whether they describe an auth failure.
 */
export interface AuthCallbackError {
  code: string
  description: string
}

type QuerySource = Record<string, unknown>

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value
  // Vue Router types a repeated query param as an array.
  if (Array.isArray(value)) return firstString(value[0])
  return undefined
}

export function parseAuthCallbackError(
  query: QuerySource,
  hash: string | undefined
): AuthCallbackError | null {
  const fragment = new URLSearchParams((hash ?? '').replace(/^#/, ''))
  const read = (key: string) => firstString(query[key]) ?? fragment.get(key) ?? undefined

  const error = read('error')
  const code = read('error_code')
  const description = read('error_description')

  // Requires more than a bare `error=` so an ordinary app URL that happens to
  // carry one is never mistaken for an auth callback. Supabase always sends a
  // code, a description, or both alongside it.
  if (!error && !code) return null
  if (!code && !description) return null

  return {
    code: code ?? error ?? 'unknown',
    // Supabase percent-encodes spaces as `+`; URLSearchParams decodes those,
    // but a value read straight from the query string has already been decoded
    // by the router, so only the fragment path needs it.
    description: description ?? ''
  }
}

/**
 * User-facing copy per Supabase error code. Anything unmapped falls back to
 * the provider's own description rather than a generic apology, since that text
 * is usually the most specific thing available.
 */
export function describeAuthCallbackError(error: AuthCallbackError): string {
  switch (error.code) {
    case 'otp_expired':
      return 'That link has expired or was already used. Email links are single-use, and they time out after a while.'
    case 'access_denied':
      return 'That link was rejected before it could sign you in.'
    default:
      return error.description || 'That link could not be used to sign you in.'
  }
}
