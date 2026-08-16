import { expect, test } from '@playwright/test'

// No live Supabase project reachable from this test run, so these cover the
// public route/API boundary and validation — not a real ranking round trip.
// See docs/PROJECT-STATUS.md for what's still unverified against a real backend.

test('viewing rankings while signed out succeeds', async ({ page }) => {
  const response = await page.goto('/rankings')
  expect(response?.url()).not.toMatch(/\/login/)
})

test('GET /api/v1/rankings without rating_type is rejected', async ({ request }) => {
  const response = await request.get('/api/v1/rankings')
  expect(response.status()).toBe(400)
})

test('GET /api/v1/rankings with a valid rating_type succeeds while signed out', async ({
  request
}) => {
  const response = await request.get('/api/v1/rankings?rating_type=singles')
  expect(response.status()).toBe(200)
})
