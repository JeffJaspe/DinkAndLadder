import { serverSupabaseUser } from '#supabase/server'
import { SponsorServiceError } from '~/server/domains/platform/services/sponsor.service'
import { createSponsorServiceFor, invalidateSponsorCache } from '~/server/utils/sponsors'
import { apiError } from '~/server/utils/api-error'

/** Remove a sponsor and its image. SuperAdmin only. */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage sponsors.')
  }

  const sponsorId = getRouterParam(event, 'sponsorId')
  if (!sponsorId) {
    throw apiError(400, 'VALIDATION_ERROR', 'sponsorId is required.')
  }

  try {
    await createSponsorServiceFor(event).remove(claims.sub, sponsorId)
    invalidateSponsorCache()
    return { message: 'Sponsor removed', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof SponsorServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[DELETE /api/v1/admin/sponsors/:sponsorId] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not remove the sponsor.')
  }
})
