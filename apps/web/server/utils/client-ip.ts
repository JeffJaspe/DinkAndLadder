import type { H3Event } from 'h3'

/**
 * The end user's IP for security decisions — currently the `remoteip` Turnstile
 * binds a token to.
 *
 * `trustProxy` comes from runtime config rather than being decided here; see
 * `resolveTrustProxy` for why that call belongs to the deployment, not to the
 * request.
 *
 * This mirrors h3's `getRequestIP` precedence rather than calling it: h3 is a
 * transitive dependency, so importing it here would make this module — and the
 * X-Forwarded-For branch, the part worth testing — unresolvable from the unit
 * test runner. The resolution order below is the contract being relied on.
 */
export function getClientIp(event: H3Event, trustProxy: boolean): string | undefined {
  // Set by Nitro presets that get the client IP from the platform itself.
  // Already authoritative, so it outranks any header.
  const platformAddress = event.context.clientAddress
  if (platformAddress) return platformAddress

  if (trustProxy) {
    const header = event.node.req.headers['x-forwarded-for']
    const raw = Array.isArray(header) ? header[0] : header
    // Leftmost hop is the original client; the rest are the proxy chain.
    const client = raw?.split(',')[0]?.trim()
    if (client) return client
  }

  return event.node.req.socket.remoteAddress || undefined
}
