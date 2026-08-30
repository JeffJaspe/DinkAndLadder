import { serverSupabaseUser } from '#supabase/server'
import { SponsorServiceError } from '~/server/domains/platform/services/sponsor.service'
import { createSponsorServiceFor, invalidateSponsorCache } from '~/server/utils/sponsors'
import { apiError } from '~/server/utils/api-error'

/** Edit a sponsor's name, link, order or enabled state. SuperAdmin only. */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage sponsors.')
  }

  const sponsorId = getRouterParam(event, 'sponsorId')
  if (!sponsorId) {
    throw apiError(400, 'VALIDATION_ERROR', 'sponsorId is required.')
  }

  type Body = {
    label?: unknown
    link_url?: unknown
    display_order?: unknown
    enabled?: unknown
  }
  const body: Body = (await readBody<Body>(event).catch(() => undefined)) ?? {}

  const patch: Record<string, unknown> = {}
  if (typeof body.label === 'string') patch.label = body.label
  // Explicitly nullable: clearing a link is a real edit, not a missing field.
  if (typeof body.link_url === 'string' || body.link_url === null) patch.link_url = body.link_url
  if (typeof body.display_order === 'number') patch.display_order = body.display_order
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled

  try {
    const sponsor = await createSponsorServiceFor(event).update(claims.sub, sponsorId, patch)
    invalidateSponsorCache()
    return { data: sponsor, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof SponsorServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[PATCH /api/v1/admin/sponsors/:sponsorId] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update the sponsor.')
  }
})
