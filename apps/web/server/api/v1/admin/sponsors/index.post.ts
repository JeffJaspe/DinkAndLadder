import { serverSupabaseUser } from '#supabase/server'
import { SponsorServiceError } from '~/server/domains/platform/services/sponsor.service'
import { createSponsorServiceFor, invalidateSponsorCache } from '~/server/utils/sponsors'
import { apiError } from '~/server/utils/api-error'

/** Add a sponsor. The image is uploaded separately, once the row exists. */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage sponsors.')
  }

  type Body = { label?: unknown; link_url?: unknown; display_order?: unknown }
  const body: Body = (await readBody<Body>(event).catch(() => undefined)) ?? {}

  if (typeof body.label !== 'string') {
    throw apiError(400, 'VALIDATION_ERROR', 'A sponsor needs a name.')
  }

  try {
    const sponsor = await createSponsorServiceFor(event).create(claims.sub, {
      label: body.label,
      link_url: typeof body.link_url === 'string' ? body.link_url : null,
      display_order: typeof body.display_order === 'number' ? body.display_order : 0
    })
    invalidateSponsorCache()
    return { data: sponsor, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof SponsorServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[POST /api/v1/admin/sponsors] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not add the sponsor.')
  }
})
