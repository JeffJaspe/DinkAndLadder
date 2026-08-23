import { serverSupabaseUser } from '#supabase/server'
import { ThemeServiceError } from '~/server/domains/platform/services/theme.service'
import { apiError } from '~/server/utils/api-error'
import { createThemeServiceFor, invalidateThemeCache } from '~/server/utils/theme'

interface Body {
  /** A palette key, or null to go back to the design system's own tokens. */
  key?: string | null
}

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change platform settings.')
  }

  const body = await readBody<Body>(event)
  // `undefined` is a malformed request; `null` is the deliberate reset.
  if (body?.key !== null && typeof body?.key !== 'string') {
    throw apiError(400, 'VALIDATION_ERROR', 'A palette key, or null to reset, is required.')
  }

  try {
    const theme = await createThemeServiceFor(event).setActivePalette(claims.sub, body.key)
    invalidateThemeCache()
    return { data: theme, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ThemeServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    console.error('[PATCH /api/v1/admin/theme] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not change the platform theme.')
  }
})
