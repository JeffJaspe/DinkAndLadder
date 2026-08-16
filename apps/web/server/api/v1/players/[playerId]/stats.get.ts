import { serverSupabaseClient } from '#supabase/server'
import { createAnalyticsService } from '~/server/domains/analytics/services/analytics.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'

export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw createError({ statusCode: 400, statusMessage: 'playerId is required' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findById(playerId)

  if (!profile) {
    throw createError({ statusCode: 404, statusMessage: 'Player not found' })
  }

  if (profile.profile_visibility !== 'public') {
    throw createError({ statusCode: 403, statusMessage: 'Profile is private' })
  }

  const service = createAnalyticsService(client)
  const stats = await service.getPlayerStats(playerId)

  return stats
})
