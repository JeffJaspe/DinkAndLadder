import { expect, test } from '@playwright/test'

// No live Supabase project yet, so these cover page structure and the
// unauthenticated redirect guard — not a real save/view round trip. See
// docs/PROJECT-STATUS.md for what's still unverified against a real backend.

test('visiting the profile editor while signed out redirects to login', async ({ page }) => {
  await page.goto('/profile/edit')
  await expect(page).toHaveURL(/\/login/)
})

test('a public player profile page is reachable without signing in', async ({ page }) => {
  const response = await page.goto('/players/some-id')
  // Not redirected to /login — the route is excluded from the auth guard.
  // The profile itself won't resolve without a live backend, so this only
  // asserts the page is reachable, not that a real profile renders.
  expect(response?.url()).not.toMatch(/\/login/)
})
