import { serverSupabaseUser } from '#supabase/server'
import { BrandingServiceError } from '~/server/domains/platform/services/branding.service'
import { apiError } from '~/server/utils/api-error'
import { createBrandingServiceFor, invalidateBrandingCache } from '~/server/utils/branding'

interface Body {
  app_name?: string
}

/** Renames the platform. An empty string restores the built-in name. */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change platform settings.')
  }

  const body = await readBody<Body>(event)
  if (typeof body?.app_name !== 'string') {
    throw apiError(400, 'VALIDATION_ERROR', 'A platform name is required.')
  }

  try {
    const branding = await createBrandingServiceFor(event).setAppName(claims.sub, body.app_name)
    invalidateBrandingCache()
    return { data: branding, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof BrandingServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[PATCH /api/v1/admin/branding] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update platform branding.')
  }
})
