import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import {
  createClubBrandingService,
  ClubBrandingServiceError,
  isClubImageSlot
} from '~/server/domains/club/services/club-branding.service'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { MAX_UPLOAD_BYTES } from '~/server/domains/platform/dto/branding.dto'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Upload a club's cover photo or logo.
 *
 * The file goes through the server rather than straight from the browser to
 * Storage, for the same reason the platform branding upload does: the bucket
 * has no anon write access, and handing a browser a write-capable credential to
 * save one hop would be a far bigger hole than this endpoint is a cost.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change club images.')
  }

  const clubId = getRouterParam(event, 'clubId')
  const slot = getRouterParam(event, 'slot')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }
  if (!isClubImageSlot(slot)) {
    // The slot names the storage path, so an unknown one is refused rather
    // than passed through.
    throw apiError(404, 'NOT_FOUND', 'No such club image slot.')
  }

  const userClient = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(403, 'FORBIDDEN', 'You have no player profile, so you cannot be a club admin.')
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.filename)
  if (!file?.data) {
    throw apiError(400, 'VALIDATION_ERROR', 'Attach an image as the `file` field.')
  }
  // Checked in the service too; this is the cheap guard that stops a huge body
  // being carried any further.
  if (file.data.length > MAX_UPLOAD_BYTES) {
    throw apiError(413, 'FILE_TOO_LARGE', 'Images must be 50 MB or smaller.')
  }

  // Service role: clubs has no UPDATE policy for the authenticated role
  // (008-security) and the bucket has no anon write access. Authorization
  // (owner/admin) is checked inside the service before either is used.
  const serviceClient = serverSupabaseServiceRole(event)
  const branding = createClubBrandingService(
    createClubRepository(serviceClient),
    createClubMembershipRepository(serviceClient),
    createBrandingAssetRepository(serviceClient)
  )

  try {
    const club = await branding.uploadImage(profile.id, clubId, slot, {
      // The declared type is what Storage will be told; the service checks it
      // against the allow-list before anything is written.
      contentType: file.type ?? 'application/octet-stream',
      bytes: file.data
    })
    return { data: club, message: 'Image updated', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ClubBrandingServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/clubs/${clubId}/images/${slot}] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not upload the image.')
  }
})
