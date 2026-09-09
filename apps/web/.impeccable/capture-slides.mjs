import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const OUT = '.impeccable/review'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    // Freeze rotation so each captured slide is the one we asked for.
    reducedMotion: 'reduce'
  })
  await ctx.addCookies([
    { name: 'dnl-theme', value: theme, domain: 'localhost', path: '/', sameSite: 'Lax' }
  ])
  const page = await ctx.newPage()
  await page.goto('http://localhost:3000/register', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })
  await page.evaluate(() => document.fonts.ready)
  await page
    .addStyleTag({ content: '#nuxt-devtools-anchor,.nuxt-devtools-anchor{display:none!important}' })
    .catch(() => {})
  await page.waitForTimeout(6000)
  for (const tab of ['Players', 'Clubs', 'Coaches']) {
    const control = page.getByRole('button', { name: tab, exact: true })
    // Poll the click: a screenshot taken before hydration lands captures the
    // previous slide under the new slide's filename, which is worse than a
    // failure because it looks like evidence.
    await expect(async () => {
      await control.click({ timeout: 2000 })
      await expect(control).toHaveAttribute('aria-current', 'true', { timeout: 1500 })
    }).toPass({ timeout: 30000 })
    await page.waitForTimeout(700)
    const file = `${OUT}/slide-${tab.toLowerCase()}-${theme}.png`
    await page.screenshot({ path: file })
    console.log('wrote', file)
  }
  await ctx.close()
}
await browser.close()
