import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/**
 * `@vitejs/plugin-vue` is what lets component specs mount real `.vue` SFCs.
 * Without it Vitest cannot parse a single-file component at all, which is why
 * `components/ui/*` had no tests before Phase 3.
 *
 * Nuxt's auto-imports do not exist under plain Vitest, so `tests/setup/nuxt-
 * autoimports.ts` registers the handful of globals the components actually use
 * (`computed`, `ref`, `useTheme`, …). That is deliberately a short, explicit
 * list rather than a Nuxt test environment: these are presentational components
 * and booting a Nuxt runtime per file would cost seconds for no added coverage.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('.', import.meta.url)),
      '@': fileURLToPath(new URL('.', import.meta.url))
    }
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['tests/setup/nuxt-autoimports.ts'],
    include: ['tests/unit/**/*.spec.ts', 'tests/integration/**/*.spec.ts']
  }
})
