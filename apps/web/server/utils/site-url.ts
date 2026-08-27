/**
 * Absolute origin for links baked into emails.
 *
 * Those links are built server-side, where there is no `window.location` to
 * read, and they have to point back at the environment the user actually signed
 * up on — one Supabase project serves local dev and the deployment at once, so
 * leaving it to the project's Site URL sends one of them to the other's host.
 *
 * Deliberately NOT derived from the request's Host header. That header is
 * caller-controlled, and a confirmation link carries a live token: trusting it
 * would let someone trigger a signup whose confirmation URL points at a host of
 * their choosing. The platform's own variables cannot be spoofed by a caller.
 *
 * Vercel injects `VERCEL_ENV`, `VERCEL_URL` (this deployment's generated
 * hostname) and `VERCEL_PROJECT_PRODUCTION_URL` (the stable production domain),
 * none of them carrying a protocol. Production resolves to the stable domain so
 * a link still works after the next deploy — `VERCEL_URL` would rot, since it
 * changes every time. A preview resolves to its own deployment URL instead, so
 * a signup made against a preview confirms against that same build.
 *
 * The local fallback is a real value rather than `undefined` so a local signup
 * confirms locally instead of silently inheriting Site URL. A non-Vercel host
 * would land on it and be wrong; `NUXT_SITE_URL` is the escape hatch, the same
 * trade-off `resolveTrustProxy` makes by defaulting to "not behind a proxy".
 *
 * Deliberately dependency-free: `nuxt.config.ts` imports it at config load time,
 * exactly as it does `resolveTrustProxy`.
 */
export function resolveSiteUrl(env: Record<string, string | undefined>): string {
  const explicit = env.NUXT_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`

  return `http://localhost:${env.PORT?.trim() || '3000'}`
}
