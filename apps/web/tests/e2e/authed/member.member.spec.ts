import { expect, test } from '@playwright/test'
import { auditRoute, visit } from '../helpers/audit'

/**
 * The second account: an ordinary player who is not an admin of any club.
 * Proves the authorisation boundary from the other side, and owns the one test
 * that ends its session (sign-out), so it cannot race the owner suite.
 */

const OWNER_CLUB_ID = '777223ae-4626-4161-93af-cffcf82f33aa' // Claude Test Club 4

test.describe.configure({ mode: 'serial' })

test('member dashboard renders', async ({ page }, testInfo) => {
  await auditRoute(page, testInfo, '/dashboard')
  await expect(page.getByRole('main')).toContainText(/Claude Test Member/)
})

test('member can view the club profile but not manage it', async ({ page }) => {
  await visit(page, `/clubs/${OWNER_CLUB_ID}`)
  await expect(page.getByRole('main')).toContainText('Claude Test Club 4')

  // Settings renders its denied panel and no editable form.
  await visit(page, `/club/${OWNER_CLUB_ID}/settings`)
  await expect(
    page.getByText('Only the club owner or an admin can change these settings.')
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /Save/ })).toHaveCount(0)

  // Members list shows the roster but no manage controls.
  await visit(page, `/club/${OWNER_CLUB_ID}/members`)
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('button', { name: /remove|promote|demote|kick/i })).toHaveCount(0)
})

test('member cannot change the club through the API', async ({ request }) => {
  const res = await request.patch(`/api/v1/clubs/${OWNER_CLUB_ID}`, {
    data: { name: 'hijacked' }
  })
  expect([401, 403, 404, 405]).toContain(res.status())
})

test('sign out from settings ends the session', async ({ page }) => {
  await visit(page, '/settings')
  await page.getByRole('button', { name: 'Sign out' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login|\/$/)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})
