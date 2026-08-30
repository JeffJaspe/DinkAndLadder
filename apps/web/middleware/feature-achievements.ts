/**
 * Route guard for the achievements screens.
 *
 * The flag map is public (`/api/v1/platform/feature-flags`) and already cached
 * for 30s server-side, so this costs nothing a page load would not already pay.
 * `useRequestFetch()` rather than `$fetch` so the SSR pass carries the incoming
 * request's cookies — the same reason `super-admin.ts` uses it.
 *
 * Defence in depth only: every achievements endpoint re-checks the flag itself
 * (server/utils/require-feature.ts). Never rely on this alone.
 */
import type { FeatureFlagMap } from '~/server/domains/platform/dto/feature-flag.dto'
import { FEATURE_ACHIEVEMENTS } from '~/server/utils/require-feature'

export default defineNuxtRouteMiddleware(async () => {
  try {
    const result = await useRequestFetch()<{ data: FeatureFlagMap }>(
      '/api/v1/platform/feature-flags'
    )
    if (result?.data?.[FEATURE_ACHIEVEMENTS] === true) return
  } catch {
    // Fall through: a flag lookup that fails reads as off, matching
    // isEnabledIn()'s fail-closed rule.
  }
  return navigateTo('/dashboard')
})
