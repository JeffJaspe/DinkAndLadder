import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The payment webhook stubs must keep returning 501.
 *
 * An earlier version returned 200 without persisting anything, so the provider
 * stopped retrying and the records were lost for good. The club-subscription
 * work adds a simulated gateway and deliberately does NOT touch these; this
 * test is the tripwire for anyone who "fixes" them to 200 before a real
 * gateway and its handler exist (ADR-005).
 *
 * It reads the source rather than importing the handler because `h3` is a
 * Nitro dependency that plain Vitest cannot resolve; the assertion is about
 * what the file says, which is exactly what a reviewer would check.
 */
describe('payment webhook stubs', () => {
  for (const route of ['stripe', 'paymongo']) {
    it(`${route} webhook still throws 501 NOT_IMPLEMENTED and nothing else`, () => {
      // Vitest runs from apps/web; import.meta.url is unreliable under happy-dom on Windows.
      const source = readFileSync(resolve(process.cwd(), `server/api/webhooks/${route}.post.ts`), 'utf8')
      expect(source).toContain("apiError(501, 'NOT_IMPLEMENTED'")
      // No persistence, no gateway import, no 200.
      expect(source).not.toMatch(/return\s*\{/)
      expect(source).not.toContain('gateways')
      expect(source).not.toContain('club-subscription.service')
    })
  }
})
