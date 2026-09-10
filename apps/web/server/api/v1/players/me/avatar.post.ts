import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import {
  createPlayerAvatarService,
  PlayerAvatarServiceError
} from '~/server/domains/player/services/player-avatar.service'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { MAX_UPLOAD_BYTES } from '~/server/domains/platform/dto/branding.dto'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Upload the signed-in player's profile photo.
 *
 * The file goes through the server rather than straight from the browser to
 * Storage, for the same reason the club and platform uploads do: the bucket has
 * no anon write access, and handing a browser a write-capable credential to
 * save one hop would be a far bigger hole than this endpoint is a cost.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change your photo.')
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.filename)
  if (!file?.data) {
    throw apiError(400, 'VALIDATION_ERROR', 'Attach an image as the `file` field.')
  }
  // Checked in the service too; this is the cheap guard that stops a huge body
  // being carried any further.
  if (file.data.length > MAX_UPLOAD_BYTES) {
    throw apiError(413, 'FILE_TOO_LARGE', 'Photos must be 50 MB or smaller.')
  }

  // The profile row is read and written with the caller's own client, so RLS
  // still applies; only the Storage repository needs the service role, because
  // the bucket has no anon write access and signing requires the same key.
  const userClient = await serverSupabaseClient(event)
  const service = createPlayerAvatarService(
    createPlayerProfileRepository(userClient),
    createBrandingAssetRepository(serverSupabaseServiceRole(event))
  )

  try {
    const profile = await service.upload(claims.sub, {
      // The declared type is what Storage will be told; the service checks it
      // against the allow-list before anything is written.
      contentType: file.type ?? 'application/octet-stream',
      bytes: file.data
    })
    return { data: profile, message: 'Photo updated', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof PlayerAvatarServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[POST /api/v1/players/me/avatar] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not upload the photo.')
  }
})
