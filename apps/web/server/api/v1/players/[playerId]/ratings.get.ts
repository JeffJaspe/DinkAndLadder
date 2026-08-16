import { serverSupabaseClient } from '#supabase/server'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createRatingService } from '~/server/domains/rating/services/rating.service'
import { toPlayerRatingDto } from '~/server/domains/rating/dto/rating.dto'
import { apiError } from '~/server/utils/api-error'

/**
 * No auth required — player_ratings is publicly readable by RLS design (see
 * 0020-player-ratings-select-policy in 008-security.changelog.xml). Returns null for a rating
 * type the player hasn't played/been rated for yet, rather than a 404 — the player itself
 * exists even if one or both rating types don't.
 */
export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw apiError(400, 'VALIDATION_ERROR', 'playerId is required.')
  }

  const client = await serverSupabaseClient(event)
  const service = createRatingService(createRatingRepository(client))

  const [singles, doubles] = await Promise.all([
    service.getRating(playerId, 'singles'),
    service.getRating(playerId, 'doubles')
  ])

  return {
    singles: singles ? toPlayerRatingDto(singles) : null,
    doubles: doubles ? toPlayerRatingDto(doubles) : null
  }
})
