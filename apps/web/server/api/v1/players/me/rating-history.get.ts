import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createRatingService } from '~/server/domains/rating/services/rating.service'
import { toRatingTransactionDto } from '~/server/domains/rating/dto/rating.dto'
import { apiError } from '~/server/utils/api-error'

/**
 * User-scoped client only — rating_transactions_select_own RLS is the actual enforcement
 * (see 008-security.changelog.xml), this route just resolves the caller's own player id first.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your rating history.')
  }

  const ratingType = getQuery(event).type
  if (ratingType !== 'singles' && ratingType !== 'doubles') {
    throw apiError(400, 'VALIDATION_ERROR', "query param 'type' must be 'singles' or 'doubles'.")
  }

  const client = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(
      409,
      'PLAYER_PROFILE_REQUIRED',
      'Complete your player profile before viewing rating history.'
    )
  }

  const service = createRatingService(createRatingRepository(client))
  const history = await service.getRatingHistory(playerProfile.id, ratingType)
  return { data: history.map(toRatingTransactionDto) }
})
