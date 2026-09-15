import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page, type TestInfo } from '@playwright/test'

/**
 * One route, fully audited: it renders without redirecting to /login (unless
 * that is what we expect), no server 5xx, no uncaught client errors, and the
 * rendered DOM clears axe at the serious/critical level.
 *
 * Server errors and page errors are asserted hard — a 500 from `/api/v1/...`
 * on a page load is a bug regardless of what the screen looks like. Landmark
 * and accessibility findings are asserted softly so one bad contrast pair does
 * not hide the next route's server error; every finding is still attached to
 * the report as JSON alongside a full-page screenshot.
 */

const BASE = 'http://localhost:3000'

const IGNORED_CONSOLE = [
  // Browser-generated network lines; the response listener already records these.
  /^Failed to load resource: the server responded with a status of/,
  // Cloudflare Turnstile's devtools-detection probe on any page with the widget.
  /^%c%d font-size:0;color:transparent NaN$/
]

export interface AuditResult {
  path: string
  finalUrl: string
  status: number | undefined
  consoleErrors: string[]
  failedRequests: string[]
  /** 4xx from our own API during load — informational, e.g. a signed-out page calling a signed-in endpoint. */
  clientErrors: string[]
  hasMainLandmark: boolean
  axeViolations: { id: string; impact: string | null | undefined; nodes: number; help: string }[]
}

export function attachCollectors(page: Page) {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []
  const clientErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return
    consoleErrors.push(text)
  })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))
  page.on('response', (res) => {
    const url = res.url()
    if (!url.startsWith(BASE)) return
    const line = `${res.status()} ${res.request().method()} ${url.slice(BASE.length)}`
    if (res.status() >= 500) failedRequests.push(line)
    else if (res.status() >= 400 && url.includes('/api/')) clientErrors.push(line)
  })
  return { consoleErrors, failedRequests, clientErrors }
}

/**
 * Arrive as a visitor who has already answered the cookie bar. The audit is
 * about the route underneath; with the bar on every screenshot, a layout
 * regression at the bottom of a page would be hidden behind it. The bar has
 * its own spec (cookie-consent.spec.ts).
 */
export async function answerCookieBanner(page: Page) {
  await page.context().addCookies([
    {
      name: 'dnl-cookie-consent',
      value: encodeURIComponent(
        JSON.stringify({ v: 1, choice: 'essential', at: '2026-09-12T00:00:00.000Z' })
      ),
      url: BASE
    }
  ])
}

/**
 * `networkidle` never arrives on pages that embed Turnstile or poll, so wait
 * for `load`, then give in-flight API calls a bounded chance to finish.
 */
export async function visit(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'load' })
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
  await page.waitForTimeout(300)
  return response
}

export async function auditRoute(
  page: Page,
  testInfo: TestInfo,
  path: string,
  opts: { expectLoginRedirect?: boolean; heading?: RegExp | string } = {}
): Promise<AuditResult> {
  const collectors = attachCollectors(page)
  await answerCookieBanner(page)
  const response = await visit(page, path)

  const finalUrl = page.url()
  const hasMainLandmark = (await page.getByRole('main').count()) > 0

  if (opts.expectLoginRedirect) {
    expect(finalUrl, `${path} should bounce a signed-out visitor to /login`).toMatch(/\/login/)
  } else {
    if (!path.startsWith('/login')) {
      expect(finalUrl, `${path} unexpectedly redirected to /login`).not.toMatch(/\/login/)
    }
    expect(response?.status(), `${path} responded ${response?.status()}`).toBeLessThan(500)
    await expect(
      page.getByRole('heading', { level: 1 }).first(),
      `${path} has no <h1>`
    ).toBeVisible()
    if (opts.heading) {
      await expect(page.getByRole('heading', { name: opts.heading }).first()).toBeVisible()
    }
  }

  await testInfo.attach(`${slug(path)}.png`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  })

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('#nuxt-devtools-frame')
    .exclude('iframe')
    .analyze()
  const axeViolations = axe.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }))

  const result: AuditResult = {
    path,
    finalUrl,
    status: response?.status(),
    ...collectors,
    hasMainLandmark,
    axeViolations
  }
  // One JSON per route per project, so a report can be built from the whole
  // run without opening every test's attachments.
  const outDir = resolve(process.cwd(), 'test-results/audit')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    resolve(outDir, `${testInfo.project.name}--${slug(path)}.json`),
    JSON.stringify({ project: testInfo.project.name, ...result }, null, 2)
  )

  expect(collectors.failedRequests, `${path}: server errors during load`).toEqual([])
  expect(collectors.consoleErrors, `${path}: uncaught client errors during load`).toEqual([])
  if (!opts.expectLoginRedirect) {
    expect.soft(hasMainLandmark, `${path}: no <main> landmark`).toBe(true)
  }
  expect.soft(axeViolations, `${path}: serious/critical axe violations`).toEqual([])
  return result
}

function slug(path: string) {
  return path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'
}
