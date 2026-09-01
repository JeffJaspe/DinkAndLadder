import { serverSupabaseServiceRole } from '#supabase/server'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    return { is_superadmin: false }
  }

  // Service role, not the caller's client: platform_config has RLS enabled with
  // zero policies (018), so a user-scoped read returns no rows and every caller —
  // the real SuperAdmin included — came back as false, silently hiding /admin.
  // The identity being checked still comes from the verified session, never the body.
  const client = serverSupabaseServiceRole(event)
  const service = createPlatformAdminService(createPlatformConfigRepository(client))

  const isSuperAdmin = await service.isSuperAdmin(claims.sub)

  return { is_superadmin: isSuperAdmin }
})
