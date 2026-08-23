import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { apiError } from '~/server/utils/api-error'
import { createFeatureFlagServiceFor } from '~/server/utils/feature-flags'

/**
 * The SuperAdmin console's view of the catalog: every flag with its label,
 * description and current state. Read straight from the table, bypassing the
 * request-level cache — the console must show what is stored, not what visitors
 * are still being served for another few seconds.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view platform settings.')
  }

  const client = serverSupabaseServiceRole(event)
  const platformAdmin = createPlatformAdminService(createPlatformConfigRepository(client))

  if (!(await platformAdmin.isSuperAdmin(claims.sub))) {
    throw apiError(403, 'FORBIDDEN', 'Only the platform SuperAdmin can view feature flags.')
  }

  try {
    return {
      data: await createFeatureFlagServiceFor(event).listFlags(),
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[GET /api/v1/admin/feature-flags] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load feature flags.')
  }
})
