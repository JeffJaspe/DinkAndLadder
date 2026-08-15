import { expect, test } from '@playwright/test'

test('visiting the match submission page while signed out redirects to login', async ({ page }) => {
  await page.goto('/matches/submit')
  await expect(page).toHaveURL(/\/login/)
})

test('visiting a match page while signed out redirects to login', async ({ page }) => {
  await page.goto('/matches/some-id')
  await expect(page).toHaveURL(/\/login/)
})

test('starting verification while signed out is rejected', async ({ request }) => {
  const response = await request.post('/api/v1/matches/some-id/verification')
  expect(response.status()).toBe(401)
})

test('recording a verification decision while signed out is rejected', async ({ request }) => {
  const response = await request.post('/api/v1/matches/some-id/verification/decision', {
    data: { status: 'confirmed' }
  })
  expect(response.status()).toBe(401)
})
