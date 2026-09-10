import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import {
  createPlayerAvatarService,
  PlayerAvatarServiceError
} from '~/server/domains/player/services/player-avatar.service'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/** Remove the signed-in player's photo. The initials avatar takes over. */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change your photo.')
  }

  const userClient = await serverSupabaseClient(event)
  const service = createPlayerAvatarService(
    createPlayerProfileRepository(userClient),
    createBrandingAssetRepository(serverSupabaseServiceRole(event))
  )

  try {
    const profile = await service.clear(claims.sub)
    return { data: profile, message: 'Photo removed', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof PlayerAvatarServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[DELETE /api/v1/players/me/avatar] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not remove the photo.')
  }
})
