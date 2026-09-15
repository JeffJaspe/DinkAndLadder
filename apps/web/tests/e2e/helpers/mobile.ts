import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page, type TestInfo } from '@playwright/test'
import { answerCookieBanner, attachCollectors, visit } from './audit'

/**
 * One route at phone width. The page must not scroll sideways, and nothing
 * may hang past the right edge of the viewport. Every route also gets a
 * full-page screenshot in `test-results/mobile-audit/` so a human can look at
 * what the numbers cannot see: a stat that wrapped mid-number, a button row
 * that stacked into a wall, a card whose title pushed its action off-screen.
 *
 * Elements inside an intentional horizontal scroller (`overflow-x: auto`) are
 * not offenders; the scroller itself is listed under `scrollers` as
 * information, because a table that has to scroll on a phone is a design
 * choice worth knowing about rather than a bug.
 */

export interface Offender {
  tag: string
  id: string
  cls: string
  text: string
  left: number
  right: number
  width: number
}

export interface MobileAuditResult {
  path: string
  finalUrl: string
  viewport: { width: number; height: number }
  /** document scrollWidth vs viewport width — > 0 means the page scrolls sideways. */
  overflowPx: number
  offenders: Offender[]
  scrollers: { tag: string; cls: string; scrollWidth: number; clientWidth: number }[]
  /** Visible interactive elements narrower or shorter than 40px (a 44px target once gap is counted). */
  smallTargets: { tag: string; text: string; w: number; h: number }[]
  screenshot: string
}

export async function auditMobileRoute(
  page: Page,
  testInfo: TestInfo,
  path: string,
  opts: { expectLoginRedirect?: boolean; settle?: () => Promise<void> } = {}
): Promise<MobileAuditResult> {
  const collectors = attachCollectors(page)
  await answerCookieBanner(page)
  await visit(page, path)
  if (opts.settle) await opts.settle()
  // Let lazy sections (feeds, rankings, brackets) finish their first fetch.
  await page.waitForTimeout(500)

  const finalUrl = page.url()
  if (opts.expectLoginRedirect) {
    expect(finalUrl).toMatch(/\/login/)
  } else if (!path.startsWith('/login')) {
    expect(finalUrl, `${path} unexpectedly redirected to /login`).not.toMatch(/\/login/)
  }

  const viewport = page.viewportSize()!
  const metrics = await page.evaluate(() => {
    const vw = window.innerWidth
    const doc = document.documentElement
    const overflowPx = Math.max(doc.scrollWidth, document.body.scrollWidth) - vw

    const isVisible = (el: Element) => {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const insideScroller = (el: Element) => {
      let p = el.parentElement
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX
        if (ox === 'auto' || ox === 'scroll') return true
        p = p.parentElement
      }
      return false
    }
    const clippedByAncestor = (el: Element) => {
      let p = el.parentElement
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX
        if (ox === 'hidden' || ox === 'clip') {
          const pr = p.getBoundingClientRect()
          if (pr.right <= vw + 1) return true
        }
        p = p.parentElement
      }
      return false
    }

    const offenders: Offender[] = []
    const seen = new Set<Element>()
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      if (el.closest('#nuxt-devtools-frame, script, style')) continue
      if (!isVisible(el)) continue
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (cs.position === 'fixed' && r.left >= vw) continue // off-canvas sheets at rest
      if (r.right <= vw + 1 && r.left >= -1) continue
      if (insideScroller(el) || clippedByAncestor(el)) continue
      // Report the shallowest element on each overflowing branch.
      let ancestorReported = false
      for (const s of seen) if (s.contains(el)) ancestorReported = true
      if (ancestorReported) continue
      seen.add(el)
      offenders.push({
        tag: el.tagName.toLowerCase(),
        id: el.id,
        cls: (el.getAttribute('class') || '').slice(0, 140),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width)
      })
      if (offenders.length >= 12) break
    }

    const scrollers = Array.from(document.body.querySelectorAll<HTMLElement>('*'))
      .filter((el) => {
        const ox = getComputedStyle(el).overflowX
        return (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 2 && isVisible(el)
      })
      .slice(0, 8)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') || '').slice(0, 100),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      }))

    const smallTargets = Array.from(
      document.body.querySelectorAll<HTMLElement>('a[href], button, [role="button"], input:not([type=hidden]), select, textarea')
    )
      .filter(isVisible)
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height)
        }
      })
      .filter((t) => t.w < 40 || t.h < 40)
      .slice(0, 12)

    return { overflowPx, offenders, scrollers, smallTargets }
  })

  const outDir = resolve(process.cwd(), 'test-results/mobile-audit')
  mkdirSync(outDir, { recursive: true })
  const file = `${viewport.width}--${slug(path)}.png`
  await page.screenshot({ path: resolve(outDir, file), fullPage: true })

  const result: MobileAuditResult = {
    path,
    finalUrl,
    viewport,
    ...metrics,
    screenshot: file
  }
  writeFileSync(resolve(outDir, `${viewport.width}--${slug(path)}.json`), JSON.stringify(result, null, 2))

  expect(collectors.failedRequests, `${path}: server errors during load`).toEqual([])
  expect.soft(metrics.overflowPx, `${path}: page scrolls sideways by ${metrics.overflowPx}px at ${viewport.width}px`).toBeLessThanOrEqual(0)
  expect.soft(
    metrics.offenders,
    `${path}: elements past the viewport edge at ${viewport.width}px`
  ).toEqual([])
  return result
}

/** A route whose id has to be discovered from the app's own data. */
export async function firstHref(page: Page, selector: string): Promise<string | null> {
  const el = page.getByRole('main').locator(selector).first()
  if ((await el.count()) === 0) return null
  const href = await el.getAttribute('href')
  return href ? new URL(href, 'http://localhost:3000').pathname : null
}

function slug(path: string) {
  return path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'
}
