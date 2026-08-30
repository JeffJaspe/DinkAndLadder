import { serverSupabaseUser } from '#supabase/server'
import { MAX_UPLOAD_BYTES } from '~/server/domains/platform/dto/branding.dto'
import { SponsorServiceError } from '~/server/domains/platform/services/sponsor.service'
import { createSponsorServiceFor, invalidateSponsorCache } from '~/server/utils/sponsors'
import { apiError } from '~/server/utils/api-error'

/**
 * Upload a sponsor's logo.
 *
 * Through the server rather than browser-to-Storage, for the same reason the
 * platform branding upload is: the bucket has no anon write access, and handing
 * a browser a write-capable credential to save one hop would be a much larger
 * hole than this endpoint is a cost.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage sponsors.')
  }

  const sponsorId = getRouterParam(event, 'sponsorId')
  if (!sponsorId) {
    throw apiError(400, 'VALIDATION_ERROR', 'sponsorId is required.')
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.filename)
  if (!file?.data) {
    throw apiError(400, 'VALIDATION_ERROR', 'Attach an image as the `file` field.')
  }
  if (file.data.length > MAX_UPLOAD_BYTES) {
    throw apiError(413, 'FILE_TOO_LARGE', 'Images must be 50 MB or smaller.')
  }

  try {
    const sponsor = await createSponsorServiceFor(event).uploadImage(claims.sub, sponsorId, {
      contentType: file.type ?? 'application/octet-stream',
      bytes: file.data
    })
    invalidateSponsorCache()
    return { data: sponsor, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof SponsorServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[POST /api/v1/admin/sponsors/:sponsorId/image] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not upload the logo.')
  }
})
