import { expect, test } from '@playwright/test'

// Same limitation as the other e2e suites: no live Supabase project, so these check
// page structure and the auth-redirect guard, not a real create/join/approve flow.

test('visiting create-club while signed out redirects to login', async ({ page }) => {
  await page.goto('/create-club')
  await expect(page).toHaveURL(/\/login/)
})

test('visiting my-clubs while signed out redirects to login', async ({ page }) => {
  await page.goto('/my-clubs')
  await expect(page).toHaveURL(/\/login/)
})

test('a club detail page is reachable without signing in', async ({ page }) => {
  const response = await page.goto('/clubs/some-id')
  expect(response?.url()).not.toMatch(/\/login/)
})
