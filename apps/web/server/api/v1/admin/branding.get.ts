import { serverSupabaseServiceRole } from '#supabase/server'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { apiError } from '~/server/utils/api-error'
import { createBrandingServiceFor } from '~/server/utils/branding'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view platform settings.')
  }

  const client = serverSupabaseServiceRole(event)
  const platformAdmin = createPlatformAdminService(createPlatformConfigRepository(client))

  if (!(await platformAdmin.isSuperAdmin(claims.sub))) {
    throw apiError(403, 'FORBIDDEN', 'Only the platform SuperAdmin can view branding.')
  }

  try {
    return {
      data: await createBrandingServiceFor(event).getBrandingForAdmin(),
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[GET /api/v1/admin/branding] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load platform branding.')
  }
})
