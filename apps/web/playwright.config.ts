import { defineConfig, devices } from '@playwright/test'

import { existsSync } from 'node:fs'

const authState = (role: 'owner' | 'member') => `test-results/.auth/${role}.json`

/**
 * Outside test-results on purpose: Playwright empties that directory at the
 * start of every run, which is fine for the minted test sessions (the setup
 * project recreates them) and would silently delete a session a person made
 * by hand. Gitignored at the repo root.
 */
const ORGANIZER_STATE = '.auth/organizer.json'

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
      testIgnore: [
        /\.member\.spec\.ts$/,
        /\.organizer\.spec\.ts$/,
        /authed\/mfa\.spec\.ts$/,
        /authed\/mobile-audit\.spec\.ts$/
      ],
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: authState('owner') }
    },
    {
      name: 'member',
      testMatch: /authed\/.*\.member\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: authState('member') }
    },
    // A real person's own account, signed in by that person. No setup step
    // mints this session and nothing here may touch the account: the file is
    // written by hand —
    //   pnpm exec playwright codegen --save-storage=.auth/organizer.json http://localhost:3000/login
    // — log in, close the window. Absent, the spec skips with that instruction.
    {
      name: 'organizer',
      testMatch: /authed\/.*\.organizer\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: existsSync(ORGANIZER_STATE) ? ORGANIZER_STATE : undefined
      }
    },
    // Every screen at phone width. Runs the owner session in a Chromium phone
    // emulation; the guest describe inside the spec drops the session itself.
    {
      name: 'mobile',
      testMatch: /authed\/mobile-audit\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        storageState: authState('owner')
      }
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
