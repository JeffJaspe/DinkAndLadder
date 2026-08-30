import type { H3Event } from 'h3'
import { isFeatureEnabled } from './feature-flags'
import { apiError } from './api-error'

/**
 * Refuse to serve an endpoint whose feature is switched off.
 *
 * `useFeatureFlags()` on the client hides UI, and its own docstring says a
 * client cannot be trusted to withhold data it was already sent. Hiding a tab
 * while the endpoint behind it still answers means a stale bundle, a direct
 * API call or the Flutter client all still see a feature the SuperAdmin turned
 * off. This is the server half of that gate.
 *
 * 404, not 403: with the feature off the resource does not exist as far as the
 * platform is concerned, and 403 would confirm that it does.
 */
export async function requireFeature(event: H3Event, key: string): Promise<void> {
  if (await isFeatureEnabled(event, key)) return
  throw apiError(404, 'FEATURE_DISABLED', 'This feature is not available.')
}

/** Key for the achievements/badges surface. Named once so gates cannot drift. */
export const FEATURE_ACHIEVEMENTS = 'achievements.enabled'
