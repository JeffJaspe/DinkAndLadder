import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const OUT = '.impeccable/review'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
for (const [route, name] of [
  ['/events', 'events'],
  ['/players', 'players']
]) {
  for (const vp of [
    { n: 'desktop', w: 1440, h: 900 },
    { n: 'mobile', w: 390, h: 844 }
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2,
      colorScheme: 'light'
    })
    await ctx.addCookies([
      { name: 'dnl-theme', value: 'light', domain: 'localhost', path: '/', sameSite: 'Lax' }
    ])
    const page = await ctx.newPage()
    await page.goto(`http://localhost:3000${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })
    await page.evaluate(() => document.fonts.ready)
    await page
      .addStyleTag({
        content: '#nuxt-devtools-anchor,.nuxt-devtools-anchor{display:none!important}'
      })
      .catch(() => {})
    await page.waitForTimeout(2500)
    const file = `${OUT}/public-${name}-${vp.n}.png`
    await page.screenshot({ path: file })
    console.log('wrote', file, '| url now:', page.url())
    await ctx.close()
  }
}
await browser.close()
