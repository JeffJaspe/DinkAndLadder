import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
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
      { name: 'dnl-theme', value: theme, domain: 'localhost', path: '/', sameSite: 'Lax' }
    ])
    const page = await ctx.newPage()
    for (const route of ['login', 'register']) {
      await page.goto(`http://localhost:3000/${route}`, {
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
      const file = `${OUT}/${route}-${theme}-${vp.name}.png`
      await page.screenshot({ path: file, fullPage: vp.name === 'mobile' })
      console.log('wrote', file)
    }
    await ctx.close()
  }
}
await browser.close()
