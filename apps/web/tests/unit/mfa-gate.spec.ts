import { describe, expect, it } from 'vitest'
import { decideMfaGate, isGatedPath } from '~/utils/mfa-gate'

/**
 * The server middleware is the thing that makes "mandatory 2FA" more than a
 * redirect. Every path × session × enrolment combination is enumerated here
 * so a later allowlist edit cannot quietly open the API to a password-only
 * session on an enrolled account.
 */

describe('isGatedPath', () => {
  it('gates the versioned API only', () => {
    expect(isGatedPath('/api/v1/players/me')).toBe(true)
    expect(isGatedPath('/api/webhooks/paymongo')).toBe(false)
    expect(isGatedPath('/dashboard')).toBe(false)
    expect(isGatedPath('/_nuxt/app.js')).toBe(false)
  })
})

describe('decideMfaGate', () => {
  it('lets signed-out requests through untouched', () => {
    expect(decideMfaGate({ path: '/api/v1/players/me', aal: null, enrolled: false })).toEqual({
      allow: true
    })
    expect(decideMfaGate({ path: '/api/v1/admin/theme', aal: null, enrolled: false })).toEqual({
      allow: true
    })
  })

  it('ignores anything outside the API', () => {
    expect(decideMfaGate({ path: '/dashboard', aal: 'aal1', enrolled: true })).toEqual({
      allow: true
    })
  })

  it('lets an unenrolled aal1 session use the API', () => {
    expect(decideMfaGate({ path: '/api/v1/players/me', aal: 'aal1', enrolled: false })).toEqual({
      allow: true
    })
  })

  it('lets an aal2 session use everything', () => {
    expect(decideMfaGate({ path: '/api/v1/players/me', aal: 'aal2', enrolled: true })).toEqual({
      allow: true
    })
    expect(decideMfaGate({ path: '/api/v1/admin/theme', aal: 'aal2', enrolled: true })).toEqual({
      allow: true
    })
  })

  it('blocks an enrolled aal1 session from ordinary endpoints', () => {
    const verdict = decideMfaGate({ path: '/api/v1/players/me', aal: 'aal1', enrolled: true })
    expect(verdict.allow).toBe(false)
    if (!verdict.allow) expect(verdict.code).toBe('MFA_REQUIRED')
  })

  it.each([
    '/api/v1/auth/session',
    '/api/v1/auth/login',
    '/api/v1/mfa/status',
    '/api/v1/mfa/recover',
    '/api/v1/me/is-superadmin'
  ])('lets an enrolled aal1 session finish signing in via %s', (path) => {
    expect(decideMfaGate({ path, aal: 'aal1', enrolled: true })).toEqual({ allow: true })
  })

  it('does not let the allowlist prefix match a lookalike', () => {
    // `/api/v1/auth-info` is not `/api/v1/auth/…`.
    const verdict = decideMfaGate({ path: '/api/v1/authors', aal: 'aal1', enrolled: true })
    expect(verdict.allow).toBe(false)
  })

  it('requires aal2 for the admin console even from an unenrolled account', () => {
    const verdict = decideMfaGate({ path: '/api/v1/admin/theme', aal: 'aal1', enrolled: false })
    expect(verdict.allow).toBe(false)
    if (!verdict.allow) expect(verdict.code).toBe('MFA_STEP_UP_REQUIRED')
  })

  it('reports the step-up code, not the generic one, for an enrolled aal1 admin call', () => {
    const verdict = decideMfaGate({ path: '/api/v1/admin/theme', aal: 'aal1', enrolled: true })
    expect(verdict.allow).toBe(false)
    if (!verdict.allow) expect(verdict.code).toBe('MFA_STEP_UP_REQUIRED')
  })
})
