import { apiError } from '~/server/utils/api-error'
import { getFeatureFlagMap } from '~/server/utils/feature-flags'

/**
 * The `key -> enabled` map, for anything that has to decide whether to render a
 * feature. Public: the flag list is not secret, the client needs it to hide UI,
 * and the table's own SELECT policy already allows the same read directly.
 *
 * Served from the request-level cache, so a page load costs no database round
 * trip of its own.
 */
export default defineEventHandler(async (event) => {
  try {
    return { data: await getFeatureFlagMap(event), request_id: crypto.randomUUID() }
  } catch (err) {
    console.error('[GET /api/v1/platform/feature-flags] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load feature flags.')
  }
})
