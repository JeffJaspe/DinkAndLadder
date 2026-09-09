import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const TARGET = process.env.CAPTURE_URL ?? 'http://localhost:3000/'
const OUT = process.env.CAPTURE_OUT ?? '.impeccable/review'
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
]
const THEMES = ['light', 'dark']

const browser = await chromium.launch()

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      colorScheme: theme
    })
    // The theme is a cookie (composables/useTheme.ts THEME_COOKIE), read on the
    // server, so it has to be set before the first request or the SSR paint
    // comes back in the wrong theme.
    const { hostname } = new URL(TARGET)
    await ctx.addCookies([
      { name: 'dnl-theme', value: theme, domain: hostname, path: '/', sameSite: 'Lax' }
    ])
    const page = await ctx.newPage()

    await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60000 })
    await page.evaluate(() => document.fonts.ready)
    // The Nuxt devtools badge is a dev-server overlay, not part of the page.
    await page
      .addStyleTag({
        content:
          '#nuxt-devtools-anchor,.nuxt-devtools-anchor,#nuxt-devtools-container{display:none!important}'
      })
      .catch(() => {})
    // Settle the one authored entrance. A single jump to the bottom leaves the
    // observer-driven rule mid-transition, so step down the page to trigger it,
    // then wait past the full 2.5s failsafe plus the longest transition delay.
    await page.evaluate(async () => {
      const step = window.innerHeight / 2
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 120))
      }
    })
    await page.waitForTimeout(4000)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(800)

    const file = `${OUT}/${theme}-${vp.name}.png`
    await page.screenshot({ path: file, fullPage: true })
    console.log('wrote', file)
    await ctx.close()
  }
}

await browser.close()
