import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createPlayerProfileService } from '~/server/domains/player/services/player-profile.service'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * No auth required — visibility is enforced by the player_profiles RLS policies
 * (owner always sees their own row; anyone sees rows marked public). The
 * user-scoped client here resolves to the anon role for unauthenticated callers,
 * which is exactly what should decide what's visible.
 */
export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw apiError(400, 'VALIDATION_ERROR', 'playerId is required.')
  }

  const client = await serverSupabaseClient(event)
  // RLS on the user-scoped client still decides whether this row is visible at
  // all; the service role only signs the avatar URL for a row already returned.
  const service = createPlayerProfileService(
    createPlayerProfileRepository(client),
    createBrandingAssetRepository(serverSupabaseServiceRole(event))
  )
  const profile = await service.getById(playerId)

  if (!profile) {
    throw apiError(404, 'NOT_FOUND', 'No player profile found with that id.')
  }

  return profile
})
