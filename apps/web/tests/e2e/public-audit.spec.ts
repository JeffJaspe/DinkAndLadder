import { test } from '@playwright/test'
import { auditRoute } from './helpers/audit'

/**
 * Every route a signed-out visitor can reach, plus every guarded route to
 * prove the guard holds. Mirrors `supabase.redirectOptions.exclude` in
 * nuxt.config.ts — if a route is added there, add it here.
 */
const PUBLIC: [string, RegExp | string | undefined][] = [
  ['/', undefined],
  ['/login', undefined],
  ['/register', undefined],
  ['/reset-password', /password/i],
  ['/update-password', /password/i],
  ['/check-email?email=someone%40example.com', undefined],
  ['/auth-error?code=otp_expired', undefined],
  ['/rankings', /rank/i],
  ['/clubs', /club/i],
  ['/events', /event/i],
  ['/players', /player/i],
  ['/verified-clubs', /club/i],
  ['/legal/cookies', /cookies/i]
]

const GUARDED = [
  '/dashboard',
  '/feed',
  '/matches',
  '/matches/submit',
  '/my-clubs',
  '/create-club',
  '/create-event',
  '/community',
  '/notifications',
  '/settings',
  '/settings/security',
  '/profile/edit',
  '/onboarding',
  '/admin/features'
]

test.describe('signed-out route audit', () => {
  for (const [path, heading] of PUBLIC) {
    test(`renders ${path}`, async ({ page }, testInfo) => {
      await auditRoute(page, testInfo, path, { heading })
    })
  }
  for (const path of GUARDED) {
    test(`guards ${path}`, async ({ page }, testInfo) => {
      await auditRoute(page, testInfo, path, { expectLoginRedirect: true })
    })
  }
})
