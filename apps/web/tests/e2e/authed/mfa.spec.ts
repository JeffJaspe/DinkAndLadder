import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { visit } from '../helpers/audit'
import { createTotpSource } from '../helpers/totp'

/**
 * The whole two-factor journey as the test owner, with the suite playing the
 * authenticator app (helpers/totp.ts).
 *
 *   enrol → the old password-only session is refused → it passes the
 *   challenge → turn 2FA off again.
 *
 * Serial and self-cleaning: the last test unenrols, and the seeder strips any
 * leftover factor before minting sessions, so a crash here cannot poison the
 * next run. The login form itself is behind Turnstile and cannot be driven;
 * the "password-only session" is the seeded storage state, which is exactly
 * what a fresh sign-in produces.
 */

test.describe.configure({ mode: 'serial' })

const AAL1_STATE = resolve(process.cwd(), 'test-results/.auth/owner.json')

let secret = ''
let codes: ReturnType<typeof createTotpSource>

/**
 * TOTP is a dashboard toggle on the Supabase project (docs/31 §0). Until it is
 * on, enrol answers MFA_NOT_ENABLED; that is a setup gap, not a product bug,
 * so the journey skips with a message rather than failing the run.
 */
let totpEnabled = true

test.beforeEach(() => {
  test.skip(!totpEnabled, 'TOTP is not enabled on the dev Supabase project')
})

test('settings shows two-factor as off', async ({ page }) => {
  const probe = await page.request.post('/api/v1/mfa/enroll')
  if (probe.status() === 400 && (await probe.json()).code === 'MFA_NOT_ENABLED') {
    totpEnabled = false
    test.skip(true, 'TOTP is not enabled on the dev Supabase project')
  }
  await visit(page, '/settings/security')
  const card = page.getByRole('main')
  await expect(card).toContainText('Authenticator app')
  await expect(card).toContainText(/Off — a code from your phone/)
})

test('the wizard enrols and shows eight recovery codes once', async ({ page }) => {
  await visit(page, '/settings/security/two-factor')

  const secretEl = page.locator('code').first()
  await expect(secretEl).toBeVisible({ timeout: 15_000 })
  secret = (await secretEl.textContent())!.trim()
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/)
  codes = createTotpSource(secret)

  await page.getByLabel('6-digit code').fill(await codes.next())
  await page.getByRole('button', { name: 'Turn on' }).click()

  const list = page.getByTestId('recovery-codes')
  await expect(list).toBeVisible({ timeout: 15_000 })
  await expect(list.locator('li')).toHaveCount(8)
  for (const code of await list.locator('li').allTextContents()) {
    expect(code.trim()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
  }

  const done = page.getByRole('button', { name: 'Done' })
  await expect(done).toBeDisabled()
  await page.getByLabel(/I have saved these codes/).check()
  await done.click()
  await expect(page.getByRole('main')).toContainText("You're protected")

  // This browser passed the code, so it keeps working.
  await visit(page, '/settings/security')
  await expect(page.getByRole('main')).toContainText(/On since/)
})

test('a password-only session is refused by the API and sent to the challenge', async ({
  browser
}) => {
  // The seeded state predates enrolment: it is what a fresh password sign-in
  // produces, and it has not presented the second factor.
  const context = await browser.newContext({ storageState: AAL1_STATE })
  const page = await context.newPage()

  const res = await page.request.get('/api/v1/players/me')
  expect(res.status()).toBe(403)
  expect(await res.json()).toMatchObject({ code: 'MFA_REQUIRED' })

  // What it may still reach: enough to finish signing in.
  expect((await page.request.get('/api/v1/mfa/status')).status()).toBe(200)

  await visit(page, '/dashboard')
  await expect(page).toHaveURL(/\/mfa\/verify/)

  await page.getByLabel('6-digit code').fill(await codes.next())
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).not.toHaveURL(/\/mfa\/verify/, { timeout: 15_000 })

  expect((await page.request.get('/api/v1/players/me')).status()).toBe(200)
  await context.close()
})

test('turning it off needs a fresh code and returns the account to password-only', async ({
  page
}) => {
  await visit(page, '/settings/security')
  await page.getByRole('button', { name: 'Turn off' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('6-digit code').fill('000000')
  await dialog.getByRole('button', { name: 'Turn off' }).click()
  await expect(dialog.getByRole('alert')).toContainText(/not right/)

  await dialog.getByLabel('6-digit code').fill(await codes.next())
  await dialog.getByRole('button', { name: 'Turn off' }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
  await expect(page.getByRole('main')).toContainText(/Off — a code from your phone/)

  const status = await page.request.get('/api/v1/mfa/status')
  expect(await status.json()).toMatchObject({ data: { enrolled: false } })
})
