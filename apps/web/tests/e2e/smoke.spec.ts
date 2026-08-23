import { expect, test } from '@playwright/test'

test('home page loads', async ({ page }) => {
  await page.goto('/')
  // Copy changed to 'Play. Compete. / Rise Up.'; the old assertion had been
  // failing against the live page for a while.
  await expect(page.getByRole('heading', { name: /Play. Compete./ })).toBeVisible()
})
