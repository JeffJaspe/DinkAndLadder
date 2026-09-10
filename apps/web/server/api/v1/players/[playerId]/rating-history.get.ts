import { serverSupabaseClient } from '#supabase/server'
import { createAnalyticsService } from '~/server/domains/analytics/services/analytics.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw apiError(400, 'MISSING_PARAMETER', 'playerId is required.')
  }

  const query = getQuery(event)
  const ratingType = (query.type as 'singles' | 'doubles') || 'singles'
  const days = parseInt(query.days as string) || 90

  if (!['singles', 'doubles'].includes(ratingType)) {
    throw apiError(400, 'INVALID_INPUT', 'type must be singles or doubles.')
  }

  if (days < 1 || days > 365) {
    throw apiError(400, 'INVALID_INPUT', 'days must be between 1 and 365.')
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
  const history = await service.getRatingHistory(playerId, ratingType, days)

  return { history }
})
