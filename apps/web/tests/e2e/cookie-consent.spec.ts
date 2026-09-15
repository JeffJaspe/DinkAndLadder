import { expect, test, type Page } from '@playwright/test'
import { visit } from './helpers/audit'

/**
 * The cookie bar in a real browser (docs/38 §6).
 *
 * Unit tests cover the component's contract; what only a browser can prove is
 * that the choice actually lands in a cookie the server reads on the next
 * request — so a reload renders the page without the bar from the first
 * paint, rather than showing it and hiding it on hydration.
 *
 * Pages are opened through `visit`, which waits past hydration: a click on
 * server-rendered HTML before Vue has attached its handlers does nothing, and
 * the heavier pages (rankings) hydrate late enough for that to bite.
 */

const COOKIE = 'dnl-cookie-consent'
const banner = (page: Page) => page.getByTestId('cookie-banner')

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
})

test('asks on first visit, on every layout', async ({ page }) => {
  // marketing layout
  await visit(page, '/')
  await expect(banner(page)).toBeVisible()

  // default layout
  await visit(page, '/rankings')
  await expect(banner(page)).toBeVisible()
  await expect(banner(page).getByRole('button', { name: 'Essential only' })).toBeVisible()
  await expect(banner(page).getByRole('button', { name: 'Accept all' })).toBeVisible()

  // auth layout
  await visit(page, '/login')
  await expect(banner(page)).toBeVisible()
})

test('"Essential only" stores the choice and the bar does not return on reload', async ({
  page,
  context
}) => {
  await visit(page, '/rankings')
  await banner(page).getByRole('button', { name: 'Essential only' }).click()
  await expect(banner(page)).toBeHidden()

  const cookie = (await context.cookies()).find((c) => c.name === COOKIE)
  expect(cookie).toBeDefined()
  expect(decodeURIComponent(cookie!.value)).toContain('"choice":"essential"')

  await visit(page, '/rankings')
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(banner(page)).toHaveCount(0)
})

test('the cookies page reflects the choice and can change it', async ({ page }) => {
  await visit(page, '/legal/cookies')
  await expect(page.getByRole('heading', { level: 1, name: 'Cookies' })).toBeVisible()
  await expect(page.getByTestId('cookie-choice')).toContainText('not chosen')

  // The bar is on this page too; answering from the page's own controls
  // must satisfy it.
  await page
    .getByRole('region', { name: 'Your choice' })
    .getByRole('button', { name: 'Accept all' })
    .click()
  await expect(banner(page)).toBeHidden()
  await expect(page.getByTestId('cookie-choice')).toContainText('Accept all')

  await page.getByRole('button', { name: 'Ask me again' }).click()
  await expect(banner(page)).toBeVisible()
  await expect(page.getByTestId('cookie-choice')).toContainText('not chosen')
})

test('the cookies page lists every category from the shared inventory', async ({ page }) => {
  await visit(page, '/legal/cookies')
  await expect(page.getByRole('heading', { level: 2, name: 'Essential' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Analytics' })).toBeVisible()
  await expect(page.getByText(COOKIE)).toBeVisible()
})
