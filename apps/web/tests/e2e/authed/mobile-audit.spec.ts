import { expect, test } from '@playwright/test'
import { auditMobileRoute, firstHref } from '../helpers/mobile'
import { visit } from '../helpers/audit'

/**
 * Every screen at phone width, signed in as the test owner (and signed out
 * for the guest pages). Runs only under the `mobile` project, which sets the
 * viewport; it is the responsive twin of route-audit.spec.ts.
 */

const STATIC: string[] = [
  '/dashboard',
  '/feed',
  '/rankings',
  '/matches',
  '/matches/submit',
  '/events',
  '/community',
  '/my-clubs',
  '/clubs',
  '/create-club',
  '/create-event',
  '/players',
  '/following',
  '/partners',
  '/notifications',
  '/achievements',
  '/settings',
  '/settings/security',
  '/settings/security/two-factor',
  '/profile/edit',
  '/verified-clubs',
  '/legal/cookies'
]

test.describe('mobile audit: signed-in screens', () => {
  for (const path of STATIC) {
    test(`fits ${path}`, async ({ page }, testInfo) => {
      await auditMobileRoute(page, testInfo, path)
    })
  }

  test('app shell: open the menu sheet', async ({ page }, testInfo) => {
    await auditMobileRoute(page, testInfo, '/dashboard')
    const open = page.getByRole('button', { name: 'Open menu' })
    await expect(open).toBeVisible()
    await open.click()
    await page.waitForTimeout(400)
    await page.screenshot({
      path: 'test-results/mobile-audit/390--dashboard--menu-open.png',
      fullPage: false
    })
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible()
  })

  test('fits the club screens the owner runs', async ({ page }, testInfo) => {
    await visit(page, '/my-clubs')
    const club = page.getByRole('main').getByText('Claude Test Club 4').first()
    await expect(club).toBeVisible()
    await club.click()
    await expect(page).toHaveURL(/\/club(s)?\/[0-9a-f-]{36}/)
    const clubId = page.url().match(/[0-9a-f-]{36}/)![0]
    await auditMobileRoute(page, testInfo, `/clubs/${clubId}`)
    await auditMobileRoute(page, testInfo, `/club/${clubId}/dashboard`)
    await auditMobileRoute(page, testInfo, `/club/${clubId}/members`)
    await auditMobileRoute(page, testInfo, `/club/${clubId}/settings`)
  })

  test('fits the event screens', async ({ page }, testInfo) => {
    await visit(page, '/events')
    const href = await firstHref(page, 'a[href^="/events/"]')
    test.skip(!href, 'no events in the dev project to open')
    await auditMobileRoute(page, testInfo, href!)
    await auditMobileRoute(page, testInfo, `${href}/matches`)
    // A live board links each court to its scoring page.
    await visit(page, href!)
    const score = await firstHref(page, 'a[href*="/courts/"]')
    if (score) await auditMobileRoute(page, testInfo, score)
  })

  test('fits the match detail', async ({ page }, testInfo) => {
    await visit(page, '/matches')
    const href = await firstHref(page, 'a[href^="/matches/"]:not([href="/matches/submit"])')
    test.skip(!href, 'this account has no matches yet')
    await auditMobileRoute(page, testInfo, href!)
  })

  test('fits the player profile and head-to-head', async ({ page }, testInfo) => {
    await visit(page, '/players')
    await page.getByPlaceholder('Search by name...').fill('Claude Test Member')
    const card = page.getByRole('main').getByText('Claude Test Member').first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.click()
    await expect(page).toHaveURL(/\/players\/[0-9a-f-]{36}/)
    const path = new URL(page.url()).pathname
    await auditMobileRoute(page, testInfo, path)
    await auditMobileRoute(page, testInfo, `${path}/head-to-head`)
  })
})

test.describe('mobile audit: guest screens', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  for (const path of [
    '/',
    '/login',
    '/register',
    '/reset-password',
    '/update-password',
    '/check-email?email=someone%40example.com',
    '/auth-error?code=otp_expired',
    '/rankings',
    '/clubs',
    '/events',
    '/players'
  ]) {
    test(`fits ${path} signed out`, async ({ page }, testInfo) => {
      await auditMobileRoute(page, testInfo, path)
    })
  }

  test('marketing header: open the sheet', async ({ page }) => {
    await visit(page, '/')
    const open = page.getByRole('button', { name: /menu/i }).first()
    if ((await open.count()) === 0) test.skip(true, 'no mobile menu control on the landing page')
    await open.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: 'test-results/mobile-audit/390--root--menu-open.png' })
  })
})
