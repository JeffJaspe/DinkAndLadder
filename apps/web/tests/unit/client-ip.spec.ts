import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { getClientIp } from '../../server/utils/client-ip'
import { resolveTrustProxy } from '../../server/utils/trust-proxy'

function fakeEvent(headers: Record<string, string>, remoteAddress?: string): H3Event {
  return {
    context: {},
    node: { req: { headers, socket: { remoteAddress } } }
  } as unknown as H3Event
}

describe('resolveTrustProxy', () => {
  it('does not trust the header on a bare host', () => {
    expect(resolveTrustProxy({})).toBe(false)
  })

  it('trusts the header on Vercel, which rewrites it at the edge', () => {
    expect(resolveTrustProxy({ VERCEL: '1' })).toBe(true)
  })

  it('lets a non-Vercel deployment behind its own proxy opt in', () => {
    expect(resolveTrustProxy({ TRUST_PROXY_HEADERS: 'true' })).toBe(true)
    expect(resolveTrustProxy({ TRUST_PROXY_HEADERS: '1' })).toBe(true)
  })

  it('lets an explicit opt-out override Vercel auto-detection', () => {
    expect(resolveTrustProxy({ VERCEL: '1', TRUST_PROXY_HEADERS: 'false' })).toBe(false)
  })

  it('treats an unset or blank variable as absent rather than as false', () => {
    // An empty string is what an unset Vercel project variable looks like;
    // it must not silently disable the auto-detection it sits beside.
    expect(resolveTrustProxy({ VERCEL: '1', TRUST_PROXY_HEADERS: '' })).toBe(true)
    expect(resolveTrustProxy({ VERCEL: '1', TRUST_PROXY_HEADERS: '  ' })).toBe(true)
  })

  it('treats any other value as untrusted rather than guessing', () => {
    expect(resolveTrustProxy({ VERCEL: '1', TRUST_PROXY_HEADERS: 'maybe' })).toBe(false)
  })
})

describe('getClientIp', () => {
  it('ignores a spoofed X-Forwarded-For when the deployment is not behind a proxy', () => {
    const event = fakeEvent({ 'x-forwarded-for': '9.9.9.9' }, '10.0.0.5')

    expect(getClientIp(event, false)).toBe('10.0.0.5')
  })

  it('reads the client from X-Forwarded-For when the proxy is trusted', () => {
    const event = fakeEvent({ 'x-forwarded-for': '203.0.113.7' }, '10.0.0.5')

    expect(getClientIp(event, true)).toBe('203.0.113.7')
  })

  it('takes the leftmost hop, not the nearest proxy, from a chain', () => {
    const event = fakeEvent({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 10.0.0.1' }, '10.0.0.5')

    expect(getClientIp(event, true)).toBe('203.0.113.7')
  })

  it('falls back to the socket address when a trusted proxy sends no header', () => {
    const event = fakeEvent({}, '10.0.0.5')

    expect(getClientIp(event, true)).toBe('10.0.0.5')
  })

  it('returns undefined rather than an empty string when nothing is known', () => {
    // verifyTurnstileToken omits `remoteip` entirely on undefined, which is
    // what Cloudflare expects — an empty value would be sent as a real one.
    expect(getClientIp(fakeEvent({}), true)).toBeUndefined()
  })
})
