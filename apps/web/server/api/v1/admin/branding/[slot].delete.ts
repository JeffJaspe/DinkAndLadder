import { isBrandingSlot } from '~/server/domains/platform/dto/branding.dto'
import { BrandingServiceError } from '~/server/domains/platform/services/branding.service'
import { apiError } from '~/server/utils/api-error'
import { createBrandingServiceFor, invalidateBrandingCache } from '~/server/utils/branding'
import { getOptionalUser } from '~/server/utils/optional-user'

/** Clears a brand image, restoring the built-in mark. */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change platform settings.')
  }

  const slot = getRouterParam(event, 'slot')
  if (!isBrandingSlot(slot)) {
    throw apiError(404, 'NOT_FOUND', 'No such branding slot.')
  }

  try {
    const branding = await createBrandingServiceFor(event).clearAsset(claims.sub, slot)
    invalidateBrandingCache()
    return { data: branding, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof BrandingServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[DELETE /api/v1/admin/branding/:slot] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not remove the image.')
  }
})
