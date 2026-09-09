import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

/**
 * The unbranded fallback: no operator hero image, so no scrim and no artwork.
 * This is what every platform without an uploaded background renders, and the
 * normal capture never reaches it because the seeded database has one set.
 */
const TARGET = 'http://localhost:3000/'
const OUT = '.impeccable/review'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

for (const theme of ['light', 'dark']) {
  for (const vp of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 }
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      colorScheme: theme
    })
    await ctx.addCookies([
      { name: 'dnl-theme', value: theme, domain: '127.0.0.1', path: '/', sameSite: 'Lax' },
      { name: 'dnl-theme', value: theme, domain: 'localhost', path: '/', sameSite: 'Lax' }
    ])

    // Strip only the hero background; every other branding field stays real.
    await ctx.route('**/api/v1/platform/branding', async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      if (body?.data) {
        body.data.hero_background_url = null
        body.data.background_url = null
        if (body.data.hero) body.data.hero.background_url = null
      }
      await route.fulfill({ response: res, json: body })
    })

    const page = await ctx.newPage()
    await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60000 })
    await page.evaluate(() => document.fonts.ready)
    await page
      .addStyleTag({
        content: '#nuxt-devtools-anchor,.nuxt-devtools-anchor{display:none!important}'
      })
      .catch(() => {})
    await page.waitForTimeout(1200)

    const file = `${OUT}/fallback-${theme}-${vp.name}.png`
    await page.screenshot({ path: file, fullPage: false })
    console.log('wrote', file)
    await ctx.close()
  }
}

await browser.close()
