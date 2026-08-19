import { expect, test } from '@playwright/test'

// No live Supabase project is configured in CI/local dev yet, so these tests
// cover what's verifiable without one: page structure and the unauthenticated
// redirect guard. Actual sign-up/login against Supabase Auth is not exercised
// here — see docs/PROJECT-STATUS.md.

test('login page has email/password fields and a link to register', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('link', { name: /register/i })).toBeVisible()
})

test('register page has email/password fields and a link to login', async ({ page }) => {
  await page.goto('/register')
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Register' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: /log in/i })).toBeVisible()
})

test('visiting the dashboard while signed out redirects to login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})

test('landing page links to login', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
})

test('check-email page is reachable while signed out and shows the given email', async ({ page }) => {
  await page.goto('/check-email?email=someone%40example.com')
  await expect(page).toHaveURL(/\/check-email/)
  await expect(page.getByText('someone@example.com')).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Log in' })).toBeVisible()
})

test('POST /api/v1/auth/register without a password returns a validation error', async ({ request }) => {
  const response = await request.post('/api/v1/auth/register', {
    data: { email: 'ci-test@example.com' }
  })
  expect(response.status()).toBe(400)
})

test('POST /api/v1/auth/login without a password returns a validation error', async ({ request }) => {
  const response = await request.post('/api/v1/auth/login', {
    data: { email: 'ci-test@example.com' }
  })
  expect(response.status()).toBe(400)
})
