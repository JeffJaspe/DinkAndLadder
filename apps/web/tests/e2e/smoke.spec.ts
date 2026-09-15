import { expect, test } from '@playwright/test'

test('home page loads', async ({ page }) => {
  await page.goto('/')
  // The hero title is branding-driven (admin/branding), so assert the landmark
  // rather than the copy — it has changed twice already.
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
})
