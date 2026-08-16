import { expect, test } from '@playwright/test'

// No live Supabase project reachable from this test run, so these cover the
// public/private route-guard boundary — not a real rating round trip. See
// docs/PROJECT-STATUS.md for what's still unverified against a real backend.

test('viewing a player public rating while signed out succeeds', async ({ request }) => {
  // A well-formed but non-existent UUID — player_id is a real uuid column, so a
  // non-uuid placeholder like "some-id" 500s on the type check before RLS/auth is
  // ever reached (same pre-existing gap as the clubs/matches routes; not this
  // pass's bug to fix). This exercises the actual public-read path.
  const response = await request.get('/api/v1/players/00000000-0000-0000-0000-000000000000/ratings')
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ singles: null, doubles: null })
})

test('viewing your own rating history while signed out is rejected', async ({ request }) => {
  const response = await request.get('/api/v1/players/me/rating-history?type=singles')
  expect(response.status()).toBe(401)
})
