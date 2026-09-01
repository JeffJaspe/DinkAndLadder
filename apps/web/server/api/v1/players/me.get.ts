import { serverSupabaseClient } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createPlayerProfileService } from '~/server/domains/player/services/player-profile.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your player profile.')
  }

  const client = await serverSupabaseClient(event)
  const service = createPlayerProfileService(createPlayerProfileRepository(client))
  const profile = await service.getOwnProfile(claims.sub)

  if (!profile) {
    throw apiError(
      404,
      'NOT_FOUND',
      'No player profile yet — save one with PATCH /api/v1/players/me.'
    )
  }

  return profile
})
