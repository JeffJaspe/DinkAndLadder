import { serverSupabaseClient } from '#supabase/server'
import { createAnalyticsService } from '~/server/domains/analytics/services/analytics.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'

export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw createError({ statusCode: 400, statusMessage: 'playerId is required' })
  }

  const query = getQuery(event)
  const ratingType = (query.type as 'singles' | 'doubles') || 'singles'
  const days = parseInt(query.days as string) || 90

  if (!['singles', 'doubles'].includes(ratingType)) {
    throw createError({ statusCode: 400, statusMessage: 'type must be singles or doubles' })
  }

  if (days < 1 || days > 365) {
    throw createError({ statusCode: 400, statusMessage: 'days must be between 1 and 365' })
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
  const history = await service.getRatingHistory(playerId, ratingType, days)

  return { history }
})
