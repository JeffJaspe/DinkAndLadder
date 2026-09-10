import { serverSupabaseClient } from '#supabase/server'
import { createAnalyticsService } from '~/server/domains/analytics/services/analytics.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw apiError(400, 'MISSING_PARAMETER', 'playerId is required.')
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findById(playerId)

  if (!profile) {
    throw apiError(404, 'NOT_FOUND', 'Player not found.')
  }

  if (profile.profile_visibility !== 'public') {
    throw apiError(403, 'FORBIDDEN', 'Profile is private.')
  }

  const service = createAnalyticsService(client)
  const stats = await service.getPlayerStats(playerId)

  return stats
})
