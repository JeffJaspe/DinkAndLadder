import { FeatureFlagServiceError } from '~/server/domains/platform/services/feature-flag.service'
import { apiError } from '~/server/utils/api-error'
import {
  createFeatureFlagServiceFor,
  invalidateFeatureFlagCache
} from '~/server/utils/feature-flags'
import { getOptionalUser } from '~/server/utils/optional-user'

interface Body {
  key?: string
  enabled?: boolean
}

/**
 * Flips one flag. One at a time rather than a whole-catalog PUT: the console
 * toggles a single switch, and a stale tab sending the whole set would silently
 * revert flags the admin never touched.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change platform settings.')
  }

  const body = await readBody<Body>(event)
  if (typeof body?.key !== 'string' || typeof body?.enabled !== 'boolean') {
    throw apiError(400, 'VALIDATION_ERROR', 'A flag key and an enabled boolean are required.')
  }

  try {
    const flag = await createFeatureFlagServiceFor(event).setFlag(
      claims.sub,
      body.key,
      body.enabled
    )
    // This process served the old value until its TTL expired; the admin who
    // just flipped it should see the change on the next request, not in 30s.
    invalidateFeatureFlagCache()
    return { data: flag, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof FeatureFlagServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    console.error('[PATCH /api/v1/admin/feature-flags] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update the feature flag.')
  }
})
