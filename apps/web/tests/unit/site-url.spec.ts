import { describe, expect, it } from 'vitest'
import { resolveSiteUrl } from '../../server/utils/site-url'

describe('resolveSiteUrl', () => {
  it('falls back to localhost when nothing identifies the environment', () => {
    expect(resolveSiteUrl({})).toBe('http://localhost:3000')
  })

  it('honours PORT for a local dev server on a non-default port', () => {
    expect(resolveSiteUrl({ PORT: '4000' })).toBe('http://localhost:4000')
  })

  it('uses the stable production domain on a Vercel production deployment', () => {
    // Not VERCEL_URL: that is the per-deploy generated hostname, so a link
    // built from it stops working at the next deploy. An emailed confirmation
    // link has to outlive the deployment that sent it.
    expect(
      resolveSiteUrl({
        VERCEL: '1',
        VERCEL_ENV: 'production',
        VERCEL_URL: 'dink-and-ladder-web-abc123-scope.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'dink-and-ladder-web.vercel.app'
      })
    ).toBe('https://dink-and-ladder-web.vercel.app')
  })

  it('uses the deployment’s own URL on a preview, not the production domain', () => {
    // A signup made against a preview build should confirm against that build.
    expect(
      resolveSiteUrl({
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'dink-and-ladder-web-abc123-scope.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'dink-and-ladder-web.vercel.app'
      })
    ).toBe('https://dink-and-ladder-web-abc123-scope.vercel.app')
  })

  it('falls back to VERCEL_URL when the production domain is not exposed', () => {
    // "Automatically expose System Environment Variables" can be switched off,
    // and a deployment-specific URL beats guessing localhost.
    expect(resolveSiteUrl({ VERCEL: '1', VERCEL_ENV: 'production', VERCEL_URL: 'x.vercel.app' })).toBe(
      'https://x.vercel.app'
    )
  })

  it('lets NUXT_SITE_URL override every platform variable', () => {
    expect(
      resolveSiteUrl({
        NUXT_SITE_URL: 'https://dinkandladder.com',
        VERCEL: '1',
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'dink-and-ladder-web.vercel.app'
      })
    ).toBe('https://dinkandladder.com')
  })

  it('strips trailing slashes from an override so the path is not doubled', () => {
    expect(resolveSiteUrl({ NUXT_SITE_URL: 'https://dinkandladder.com//' })).toBe(
      'https://dinkandladder.com'
    )
  })

  it('ignores a blank override rather than producing a protocol-less origin', () => {
    expect(resolveSiteUrl({ NUXT_SITE_URL: '   ' })).toBe('http://localhost:3000')
  })
})
