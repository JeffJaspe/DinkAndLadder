import { serverSupabaseUser } from '#supabase/server'
import { SponsorServiceError } from '~/server/domains/platform/services/sponsor.service'
import { createSponsorServiceFor } from '~/server/utils/sponsors'
import { apiError } from '~/server/utils/api-error'

/** Every sponsor, enabled or not. SuperAdmin only. */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage sponsors.')
  }

  try {
    return {
      data: await createSponsorServiceFor(event).listForAdmin(claims.sub),
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    if (err instanceof SponsorServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[GET /api/v1/admin/sponsors] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load sponsors.')
  }
})
