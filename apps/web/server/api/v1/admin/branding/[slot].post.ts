import { serverSupabaseUser } from '#supabase/server'
import { isBrandingSlot, MAX_UPLOAD_BYTES } from '~/server/domains/platform/dto/branding.dto'
import { BrandingServiceError } from '~/server/domains/platform/services/branding.service'
import { apiError } from '~/server/utils/api-error'
import { createBrandingServiceFor, invalidateBrandingCache } from '~/server/utils/branding'

/**
 * Uploads one brand image into a named slot (`logo` or `favicon`).
 *
 * The file goes through the server rather than straight from the browser to
 * Storage: the bucket has no anon write access, and handing a browser a
 * write-capable credential to avoid one hop would be a much larger hole than
 * this endpoint is a cost.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change platform settings.')
  }

  const slot = getRouterParam(event, 'slot')
  if (!isBrandingSlot(slot)) {
    // The slot names the storage path, so an unknown one is refused rather
    // than passed through.
    throw apiError(404, 'NOT_FOUND', 'No such branding slot.')
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.filename)

  if (!file?.data) {
    throw apiError(400, 'VALIDATION_ERROR', 'Attach an image as the `file` field.')
  }
  // Checked before the service too, but this is the cheap guard that keeps a
  // huge body from being carried any further.
  if (file.data.length > MAX_UPLOAD_BYTES) {
    throw apiError(413, 'FILE_TOO_LARGE', 'Images must be 50 MB or smaller.')
  }

  try {
    const branding = await createBrandingServiceFor(event).uploadAsset(claims.sub, slot, {
      filename: file.filename ?? 'upload',
      // The declared type is what Storage will be told; the service checks it
      // against the allow-list before anything is written.
      contentType: file.type ?? 'application/octet-stream',
      bytes: file.data
    })
    invalidateBrandingCache()
    return { data: branding, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof BrandingServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[POST /api/v1/admin/branding/:slot] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not upload the image.')
  }
})
