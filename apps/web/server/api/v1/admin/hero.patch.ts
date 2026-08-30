import { serverSupabaseUser } from '#supabase/server'
import {
  BrandingServiceError,
  type HeroInput
} from '~/server/domains/platform/services/branding.service'
import { apiError } from '~/server/utils/api-error'
import { createBrandingServiceFor, invalidateBrandingCache } from '~/server/utils/branding'

/**
 * Landing-page hero copy and overlay (docs/30 §2.3). The background image goes
 * through the shared asset endpoint as the `hero` slot.
 *
 * A partial patch: only the fields present are touched, so saving a headline
 * cannot silently blank the overlay someone else tuned.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change platform settings.')
  }

  const body = await readBody<HeroInput>(event)
  if (!body || typeof body !== 'object') {
    throw apiError(400, 'VALIDATION_ERROR', 'A hero patch is required.')
  }

  try {
    const branding = await createBrandingServiceFor(event).setHero(claims.sub, body)
    invalidateBrandingCache()
    return { data: branding, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof BrandingServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[PATCH /api/v1/admin/hero] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update the landing hero.')
  }
})
