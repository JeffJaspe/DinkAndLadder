import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { apiError } from '~/server/utils/api-error'
import { createThemeServiceFor } from '~/server/utils/theme'

/**
 * The SuperAdmin console's view: the whole catalog plus which one is active.
 * Read straight through, not from the render cache — the console must show what
 * is stored.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view platform settings.')
  }

  const client = serverSupabaseServiceRole(event)
  const platformAdmin = createPlatformAdminService(createPlatformConfigRepository(client))

  if (!(await platformAdmin.isSuperAdmin(claims.sub))) {
    throw apiError(403, 'FORBIDDEN', 'Only the platform SuperAdmin can view the theme.')
  }

  try {
    const service = createThemeServiceFor(event)
    return {
      data: {
        palettes: await service.listPalettes(),
        active_key: await service.getActiveKey()
      },
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[GET /api/v1/admin/theme] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load theme palettes.')
  }
})
