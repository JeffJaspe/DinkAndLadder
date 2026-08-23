import { apiError } from '~/server/utils/api-error'
import { getBranding } from '~/server/utils/branding'

/**
 * The platform's name and brand images. Public: this paints the header of every
 * page, signed in or not.
 *
 * Asset URLs are minted here rather than stored, so the same row works whether
 * the bucket is public (stable URL) or private (short-lived signed URL).
 */
export default defineEventHandler(async (event) => {
  try {
    return { data: await getBranding(event), request_id: crypto.randomUUID() }
  } catch (err) {
    console.error('[GET /api/v1/platform/branding] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load platform branding.')
  }
})
