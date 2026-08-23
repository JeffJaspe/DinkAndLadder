import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Phase 6 of docs/33 — the theme layer, verified in a real browser.
 *
 * These cover the failure modes that unit tests structurally cannot see: that
 * tokens actually resolve to different colours per theme, that the choice
 * survives a reload without a flash, and that the rendered result clears
 * WCAG AA once every colour, font and layout rule has been applied together.
 *
 * Only routes reachable while signed out are exercised. Authenticated screens
 * need a seeded test account; that is tracked as remaining work rather than
 * faked with a stubbed session, which would not prove the real page renders.
 */

const PUBLIC_ROUTES = ['/', '/rankings', '/login', '/register']

/** Sets the theme the way a returning visitor arrives: cookie already present. */
async function visitWithTheme(page: Page, path: string, theme: 'light' | 'dark') {
  await page.context().clearCookies()
  await page
    .context()
    .addCookies([{ name: 'dnl-theme', value: theme, url: 'http://localhost:3000' }])
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  // Let the head manager settle the class before asserting on computed styles.
  await page.waitForTimeout(500)
}

function readTokens(page: Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    return {
      htmlClass: document.documentElement.className,
      dataTheme: document.documentElement.getAttribute('data-theme'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      canvas: root.getPropertyValue('--dnl-canvas').trim(),
      primary: root.getPropertyValue('--dnl-primary').trim(),
      fg: root.getPropertyValue('--dnl-fg').trim()
    }
  })
}

test.describe('theme', () => {
  test('light is the default for a first-time visitor', async ({ page }) => {
    // No cookie at all — the product default must not depend on one existing.
    await page.context().clearCookies()
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)

    const state = await readTokens(page)
    expect(state.htmlClass).not.toContain('dark')
    expect(state.dataTheme).toBe('light')
  })

  test('tokens resolve to different values per theme', async ({ page }) => {
    await visitWithTheme(page, '/', 'light')
    const light = await readTokens(page)

    await visitWithTheme(page, '/', 'dark')
    const dark = await readTokens(page)

    expect(light.canvas).not.toBe(dark.canvas)
    expect(light.primary).not.toBe(dark.primary)
    expect(light.fg).not.toBe(dark.fg)
    expect(light.bodyBg).not.toBe(dark.bodyBg)
    expect(dark.htmlClass).toContain('dark')
  })

  test('the switch flips the theme and persists it across a reload', async ({ page }) => {
    await visitWithTheme(page, '/rankings', 'light')

    const toggle = page.getByRole('switch', { name: 'Dark mode' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    await toggle.click()
    await page.waitForTimeout(600)
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect((await readTokens(page)).htmlClass).toContain('dark')

    // The cookie is what makes SSR render dark on the next request, which is
    // what prevents a flash of the wrong theme.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
    expect((await readTokens(page)).htmlClass).toContain('dark')

    const cookie = (await page.context().cookies()).find((c) => c.name === 'dnl-theme')
    expect(cookie?.value).toBe('dark')
  })

  test('the sun/moon thumb travels left to right', async ({ page }) => {
    await visitWithTheme(page, '/rankings', 'light')

    const offset = () =>
      page.evaluate(() => {
        const thumb = document.querySelector('.dnl-thumb')
        if (!thumb) return null
        const track = thumb.parentElement!
        return Math.round(thumb.getBoundingClientRect().left - track.getBoundingClientRect().left)
      })

    const left = await offset()
    await page.getByRole('switch', { name: 'Dark mode' }).click()
    await page.waitForTimeout(600)
    const right = await offset()

    expect(left).not.toBeNull()
    expect(right!).toBeGreaterThan(left!)
  })

  test('body paints the canvas token, not a wrapper', async ({ page }) => {
    // A wrapper div only paints its own box, so overscroll bounce and anything
    // teleported to <body> (modals, toasts) would show the wrong theme.
    await visitWithTheme(page, '/', 'dark')
    expect((await readTokens(page)).bodyBg).toBe('rgb(11, 13, 9)')
  })
})

test.describe('no hardcoded colours survive in the rendered page', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} responds to the theme`, async ({ page }) => {
      await visitWithTheme(page, route, 'light')
      const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

      await visitWithTheme(page, route, 'dark')
      const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

      expect(light, `${route} should not render identically in both themes`).not.toBe(dark)
    })
  }
})

test.describe('accessibility', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const route of PUBLIC_ROUTES) {
      test(`${route} has no serious axe violations in ${theme}`, async ({ page }) => {
        await visitWithTheme(page, route, theme)

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          // The Nuxt DevTools toolbar is not ours to make accessible, and its
          // timing pill is a real 3.54:1 violation (#888888 on #FFFFFF at
          // 9.6px). `reuseExistingServer` means this suite runs against a dev
          // server whenever one happens to be up on :3000 instead of against
          // `pnpm run preview`, so without this the result depends on whether
          // the developer left `pnpm dev` running.
          .exclude('nuxt-devtools-frame')
          .analyze()

        // Report the rule ids rather than a bare count, so a failure says what
        // broke without needing a rerun.
        const serious = results.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical'
        )
        expect(
          serious.map((v) => `${v.id} (${v.nodes.length} nodes)`),
          `${route} in ${theme}`
        ).toEqual([])
      })
    }
  }
})
