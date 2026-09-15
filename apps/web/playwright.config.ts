import { defineConfig, devices } from '@playwright/test'

const authState = (role: 'owner' | 'member') => `test-results/.auth/${role}.json`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'pnpm run preview',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    // Mints real sessions for the two dev-project test accounts (see
    // tests/e2e/auth/seed.ts). Everything under tests/e2e/authed depends on it.
    { name: 'setup', testMatch: /auth\/.*\.setup\.ts/ },
    {
      name: 'public',
      testIgnore: [/authed\//, /auth\//],
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'owner',
      testMatch: /authed\//,
      testIgnore: [/\.member\.spec\.ts$/, /authed\/mfa\.spec\.ts$/],
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: authState('owner') }
    },
    {
      name: 'member',
      testMatch: /authed\/.*\.member\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: authState('member') }
    },
    // Enrols the owner account in two-factor and unenrols it at the end. While
    // it is enrolled, the seeded password-only session is refused by the API -
    // which is the point of the test and would be a 403 storm for any other
    // owner spec running at the same time. So it runs alone, after the rest.
    {
      name: 'mfa',
      testMatch: /authed\/mfa\.spec\.ts$/,
      dependencies: ['owner', 'member'],
      use: { ...devices['Desktop Chrome'], storageState: authState('owner') }
    }
  ]
})
