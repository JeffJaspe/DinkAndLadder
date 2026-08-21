import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    return { is_superadmin: false }
  }

  const client = await serverSupabaseClient(event)
  const service = createPlatformAdminService(createPlatformConfigRepository(client))

  const isSuperAdmin = await service.isSuperAdmin(claims.sub)

  return { is_superadmin: isSuperAdmin }
})
