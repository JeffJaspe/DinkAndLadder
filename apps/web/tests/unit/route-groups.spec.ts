import { describe, expect, it } from 'vitest'
import {
  GUEST_ROUTES,
  RECOVERY_ROUTE,
  isChromelessRoute,
  isGuestRoute
} from '../../utils/route-groups'

describe('isGuestRoute', () => {
  it('claims the landing page, which is where a signed-in user kept landing', () => {
    expect(isGuestRoute('/')).toBe(true)
  })

  it('claims the sign-in and sign-up pages', () => {
    expect(isGuestRoute('/login')).toBe(true)
    expect(isGuestRoute('/register')).toBe(true)
    expect(isGuestRoute('/reset-password')).toBe(true)
    expect(isGuestRoute('/check-email')).toBe(true)
  })

  it('leaves the recovery form alone — the recovery token is itself a session', () => {
    expect(isGuestRoute(RECOVERY_ROUTE)).toBe(false)
  })

  it('leaves /confirm and /auth-error alone, since both are arrived at mid-flow', () => {
    expect(isGuestRoute('/confirm')).toBe(false)
    expect(isGuestRoute('/auth-error')).toBe(false)
  })

  it('does not claim in-app routes', () => {
    for (const path of ['/dashboard', '/feed', '/clubs', '/events', '/settings']) {
      expect(isGuestRoute(path)).toBe(false)
    }
  })

  it('treats a trailing slash as the same route', () => {
    expect(isGuestRoute('/login/')).toBe(true)
    expect(isGuestRoute('/')).toBe(true)
  })

  it('does not match a route that merely starts with a guest route', () => {
    // /registered-players is not /register.
    expect(isGuestRoute('/registered-players')).toBe(false)
    expect(isGuestRoute('/login-help')).toBe(false)
  })
})

describe('isChromelessRoute', () => {
  it('covers every guest route', () => {
    for (const path of GUEST_ROUTES) {
      expect(isChromelessRoute(path)).toBe(true)
    }
  })

  it('covers the recovery form — the shell around it was the reported bug', () => {
    expect(isChromelessRoute(RECOVERY_ROUTE)).toBe(true)
  })

  it('covers the callback pages, which are not guest-only but must stay bare', () => {
    expect(isChromelessRoute('/confirm')).toBe(true)
    expect(isChromelessRoute('/auth-error')).toBe(true)
  })

  it('leaves in-app routes to the app shell', () => {
    expect(isChromelessRoute('/dashboard')).toBe(false)
    expect(isChromelessRoute('/players/abc')).toBe(false)
  })
})
