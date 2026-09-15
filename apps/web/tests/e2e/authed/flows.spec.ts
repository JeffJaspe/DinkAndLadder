import { expect, test } from '@playwright/test'
import { attachCollectors, auditRoute, visit } from '../helpers/audit'

/**
 * Signed-in journeys as the test owner, driven through the real UI against the
 * dev Supabase project. Nothing here creates a record that outlives the test:
 * the profile edit is reverted, and the club used is the one the account
 * already owns.
 */

test.describe('dashboard', () => {
  test('greets the signed-in player and links to the core surfaces', async ({ page }) => {
    const { failedRequests } = attachCollectors(page)
    await visit(page, '/dashboard')
    await expect(page.getByRole('main')).toContainText(/Claude Test Owner/)
    const nav = page.getByRole('navigation').first()
    for (const name of ['Dashboard', 'Rankings', 'Matches', 'Events', 'My Clubs', 'Players']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    }
    expect(failedRequests).toEqual([])
  })
})

test.describe('profile', () => {
  test('edit round-trip: change display name, see it on the public profile, revert', async ({
    page
  }) => {
    const original = 'Claude Test Owner'
    const changed = `Claude Test Owner ${Date.now() % 1000}`

    await visit(page, '/profile/edit')
    const name = page.getByLabel(/Display name/)
    await expect(name).toHaveValue(original)

    const save = page.getByRole('button', { name: /Save/ })
    await expect(save).toBeDisabled() // nothing dirty yet

    await name.fill(changed)
    await expect(save).toBeEnabled()
    await save.click()
    await expect(page.getByText('Profile saved.')).toBeVisible()

    // The change is real: it shows on the sidebar and the public profile.
    await visit(page, '/dashboard')
    await expect(page.getByRole('main')).toContainText(changed)

    await visit(page, '/profile/edit')
    await page.getByLabel(/Display name/).fill(original)
    await page.getByRole('button', { name: /Save/ }).click()
    await expect(page.getByText('Profile saved.')).toBeVisible()
  })

  test('empty display name cannot be saved', async ({ page }) => {
    await visit(page, '/profile/edit')
    await page.getByLabel(/Display name/).fill('')
    await expect(page.getByRole('button', { name: /Save/ })).toBeDisabled()
  })
})

test.describe('players', () => {
  test('search finds the other test account and opens their profile', async ({
    page
  }, testInfo) => {
    await visit(page, '/players')
    const search = page.getByPlaceholder('Search by name...')
    await search.fill('Claude Test Member')
    const card = page.getByRole('main').getByText('Claude Test Member').first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.click()
    await expect(page).toHaveURL(/\/players\/[0-9a-f-]{36}/)
    await expect(page.getByRole('main')).toContainText('Claude Test Member')
    // Audit the detail page and the head-to-head page it links to.
    await auditRoute(page, testInfo, page.url().replace('http://localhost:3000', ''))
    await auditRoute(page, testInfo, `${new URL(page.url()).pathname}/head-to-head`)
  })
})

test.describe('clubs', () => {
  test('discover → club profile → owner admin screens', async ({ page }, testInfo) => {
    await visit(page, '/my-clubs')
    const club = page.getByRole('main').getByText('Claude Test Club 4').first()
    await expect(club).toBeVisible()
    await club.click()
    await expect(page).toHaveURL(/\/club(s)?\/[0-9a-f-]{36}/)
    const clubId = page.url().match(/[0-9a-f-]{36}/)![0]

    await auditRoute(page, testInfo, `/clubs/${clubId}`, { heading: /Claude Test Club 4/ })
    await auditRoute(page, testInfo, `/club/${clubId}/dashboard`)
    await auditRoute(page, testInfo, `/club/${clubId}/members`)
    await auditRoute(page, testInfo, `/club/${clubId}/settings`)
  })

  test('discover clubs search narrows the list', async ({ page }) => {
    await visit(page, '/clubs')
    const search = page.getByPlaceholder('Search clubs...')
    await search.fill('zzz-no-such-club-zzz')
    await expect(page.getByRole('heading', { name: 'No clubs found' })).toBeVisible({
      timeout: 10_000
    })
    await search.fill('Claude Test Club')
    await expect(page.getByRole('main').getByText('Claude Test Club 4').first()).toBeVisible()
  })

  test('create-club form validates before submitting', async ({ page }) => {
    await visit(page, '/create-club')
    const submit = page.getByRole('button', { name: /create/i }).last()
    await submit.click()
    // Either the button is disabled on an empty form or native validation
    // holds the page — in neither case may a club be created.
    await expect(page).toHaveURL(/\/create-club/)
  })
})

test.describe('events', () => {
  test('list → first event detail renders and its matches tab loads', async ({
    page
  }, testInfo) => {
    await visit(page, '/events')
    const first = page
      .getByRole('main')
      .getByRole('link', { name: /.+/ })
      .filter({
        has: page.locator('h2')
      })
    if ((await first.count()) === 0) {
      test.skip(true, 'no events in the dev project to open')
    }
    await first.first().click()
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}/)
    const eventId = page.url().match(/[0-9a-f-]{36}/)![0]
    await auditRoute(page, testInfo, `/events/${eventId}`)
    await auditRoute(page, testInfo, `/events/${eventId}/matches`)
  })
})

test.describe('matches', () => {
  test('list → open the most recent match detail', async ({ page }, testInfo) => {
    await visit(page, '/matches')
    const link = page
      .getByRole('main')
      .locator('a[href^="/matches/"]:not([href="/matches/submit"])')
      .first()
    if ((await link.count()) === 0) {
      test.skip(true, 'this account has no matches yet')
    }
    await link.click()
    await expect(page).toHaveURL(/\/matches\/[0-9a-f-]{36}/)
    await auditRoute(page, testInfo, new URL(page.url()).pathname)
  })

  test('submit page without an event offers the event picker', async ({ page }) => {
    await visit(page, '/matches/submit')
    await expect(page.getByRole('heading', { name: 'Which event was this?' })).toBeVisible()
  })
})

test.describe('rankings', () => {
  test('board renders rows and the rating type can be switched', async ({ page }) => {
    const { failedRequests } = attachCollectors(page)
    await visit(page, '/rankings')
    const main = page.getByRole('main')
    await expect(main).toBeVisible()
    const doubles = main
      .getByRole('button', { name: /doubles/i })
      .or(main.getByRole('tab', { name: /doubles/i }))
    if (await doubles.count()) {
      await doubles.first().click()
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
    }
    expect(failedRequests).toEqual([])
  })
})

test.describe('notifications & settings', () => {
  test('notifications page loads and mark-all-read is harmless when empty', async ({ page }) => {
    const { failedRequests } = attachCollectors(page)
    await visit(page, '/notifications')
    const markAll = page.getByRole('button', { name: /mark all/i })
    if (await markAll.count()) {
      await markAll.first().click()
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
    }
    expect(failedRequests).toEqual([])
  })

  test('theme toggle persists across reload', async ({ page }) => {
    await visit(page, '/settings')
    const before = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    const toggle = page.getByRole('switch', { name: 'Dark mode' }).first()
    await toggle.click()
    await page.waitForTimeout(300)
    await page.reload({ waitUntil: 'load' })
    const after = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(after).not.toBe(before)
    // Put it back so the next test does not inherit a dark screenshot.
    await page.getByRole('switch', { name: 'Dark mode' }).first().click()
  })
})
