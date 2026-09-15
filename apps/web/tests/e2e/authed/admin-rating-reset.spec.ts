import { expect, test, type Page } from '@playwright/test'
import { answerCookieBanner, attachCollectors, visit } from '../helpers/audit'

/**
 * The SuperAdmin "reset a player's rating" tool on /admin/ratings, driven as
 * the test owner with the two admin endpoints mocked at the network edge.
 *
 * Why mocked: the SuperAdmin is one real account in platform_config and the
 * seeded test sessions are not it, so the real API answers 403. The guard is
 * client-side on an in-app navigation, which is what lets `page.route` stand
 * in. The reset itself is covered by rating.service.spec.ts; this covers the
 * screen — the lookup, the confirmation, and what pressing Reset sends.
 */

const PLAYER_ID = '00000000-0000-4000-8000-000000000042'

const RATED = {
  id: 'user-1',
  email: 'maria@example.com',
  mfa_enrolled_at: null,
  is_self: false,
  player: {
    id: PLAYER_ID,
    display_name: 'Maria Santos',
    singles_rating: 3.8,
    doubles_rating: 4.1,
    matches_played: 12
  }
}

async function openTool(page: Page, onReset?: (url: string) => void) {
  await page.route('**/api/v1/me/is-superadmin', (r) =>
    r.fulfill({ json: { is_superadmin: true, mfa_enrolled: true, aal: 'aal2' } })
  )
  await page.route('**/api/v1/admin/users/lookup?**', (r) => {
    const email = new URL(r.request().url()).searchParams.get('email')
    if (email === RATED.email) return r.fulfill({ json: { data: RATED } })
    if (email === 'new@example.com')
      return r.fulfill({ json: { data: { ...RATED, email, player: null } } })
    return r.fulfill({
      status: 404,
      json: { code: 'NOT_FOUND', message: 'No account has that email address.' }
    })
  })
  await page.route('**/api/v1/admin/players/*/rating-reset', async (r) => {
    onReset?.(r.request().url())
    await r.fulfill({ json: { message: 'The rating was reset.' } })
  })
  await answerCookieBanner(page)
  await visit(page, '/dashboard')
  await page.evaluate(() => {
    const root = document.querySelector('#__nuxt') as HTMLElement & {
      __vue_app__: { config: { globalProperties: { $router: { push(p: string): void } } } }
    }
    root.__vue_app__.config.globalProperties.$router.push('/admin/ratings')
  })
  await page.waitForURL('**/admin/ratings**')
}

test.describe('admin rating reset', () => {
  test('looks a rated player up, confirms, and posts the reset for that player', async ({
    page
  }) => {
    const { failedRequests, consoleErrors } = attachCollectors(page)
    let resetUrl = ''
    await openTool(page, (url) => (resetUrl = url))

    await expect(page.getByRole('heading', { level: 1, name: 'Ratings' })).toBeVisible()

    await page.getByLabel('Account email').fill(RATED.email)
    await page.getByRole('button', { name: 'Look up' }).click()

    const card = page.getByTestId('reset-lookup-result')
    await expect(card).toContainText('Maria Santos')
    await expect(card).toContainText('Singles 3.80')
    await expect(card).toContainText('12 rated matches')

    await card.getByRole('button', { name: 'Reset rating' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Maria Santos will go back to unrated')
    await dialog.getByRole('button', { name: 'Reset rating' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'rating was reset' })).toContainText(
      "Maria Santos's rating was reset"
    )
    expect(resetUrl).toContain(`/api/v1/admin/players/${PLAYER_ID}/rating-reset`)
    // The card now reflects the reset, and there is nothing left to press.
    await expect(card).toContainText('Unrated')
    await expect(card.getByRole('button', { name: 'Reset rating' })).toHaveCount(0)

    expect(failedRequests).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('offers no reset for an account with no player profile, and reports an unknown email', async ({
    page
  }) => {
    await openTool(page)

    await page.getByLabel('Account email').fill('new@example.com')
    await page.getByRole('button', { name: 'Look up' }).click()
    const card = page.getByTestId('reset-lookup-result')
    await expect(card).toContainText('No player profile yet')
    await expect(card.getByRole('button', { name: 'Reset rating' })).toHaveCount(0)

    await page.getByLabel('Account email').fill('nobody@example.com')
    await page.getByRole('button', { name: 'Look up' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'No account' })).toContainText(
      'No account has that email address'
    )
  })
})
