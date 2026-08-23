import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createRatingService } from '~/server/domains/rating/services/rating.service'
import { toPlayerRatingDto } from '~/server/domains/rating/dto/rating.dto'
import { apiError } from '~/server/utils/api-error'

/**
 * Plugs a real gap: only GET /api/v1/players/{playerId}/ratings existed — there was no
 * "me" variant, but pages/dashboard.vue calls exactly this URL, so the dashboard's own
 * rating/rank display always 404'd. Same shape as the {playerId} variant, just resolving
 * the caller's own player profile first.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your ratings.')
  }

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(
      404,
      'NOT_FOUND',
      'No player profile yet — save one with PATCH /api/v1/players/me.'
    )
  }

  const service = createRatingService(createRatingRepository(client))
  const [singles, doubles] = await Promise.all([
    service.getRating(profile.id, 'singles'),
    service.getRating(profile.id, 'doubles')
  ])

  return {
    singles: singles ? toPlayerRatingDto(singles) : null,
    doubles: doubles ? toPlayerRatingDto(doubles) : null
  }
})
