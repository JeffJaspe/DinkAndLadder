/**
 * Whether `X-Forwarded-For` may be believed when deriving a client IP.
 *
 * The header is client-controlled unless something upstream overwrites it, so
 * reading it is only correct behind a proxy that does. Trusting it
 * unconditionally would let a caller pin every request to an IP of their
 * choosing — worse than sending none, because Turnstile would then score a
 * fiction instead of scoring nothing. Ignoring it unconditionally is the bug
 * F-11 recorded: on Vercel every request looks like it came from the edge, so
 * the signal is uniform noise. Hence trust is configured deployment-wide and
 * never inferred per request.
 *
 * `TRUST_PROXY_HEADERS` wins when set, so a non-Vercel deployment behind its own
 * load balancer can opt in and a Vercel deployment can opt out. Otherwise Vercel
 * is auto-detected; everything else — local dev, a bare Node host — defaults to
 * not trusting the header, which is the direction that fails safe.
 *
 * Deliberately dependency-free: `nuxt.config.ts` imports it at config load time.
 */
export function resolveTrustProxy(env: Record<string, string | undefined>): boolean {
  const explicit = env.TRUST_PROXY_HEADERS?.trim().toLowerCase()
  if (explicit) {
    return explicit === 'true' || explicit === '1'
  }
  return Boolean(env.VERCEL)
}
