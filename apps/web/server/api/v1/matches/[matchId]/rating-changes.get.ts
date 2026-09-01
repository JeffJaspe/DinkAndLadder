import { serverSupabaseClient } from '#supabase/server'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import { createMatchService } from '~/server/domains/match/services/match.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createRatingService } from '~/server/domains/rating/services/rating.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Rating changes produced by one match, with player names resolved.
 *
 * Feeds the "Ratings Updated" step of the Match Details verification timeline
 * (docs/33 §5.6). The mockup shows *both* sides of the swing — "John Doe +12,
 * Mark Cruz −12" — and that is the point: a player who can see the engine is
 * symmetric is far less likely to dispute the result.
 *
 * Returns an empty list rather than 404 when the match has not been rated yet;
 * "submitted but not yet rated" is a normal state in the verification flow, not
 * an error.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view this match.')
  }

  const matchId = getRouterParam(event, 'matchId')
  if (!matchId) {
    throw apiError(400, 'VALIDATION_ERROR', 'matchId is required.')
  }

  const client = await serverSupabaseClient(event)

  // Load the match through the same service the detail endpoint uses, so match
  // visibility stays governed by one set of RLS policies rather than this
  // endpoint inventing its own rule.
  const match = await createMatchService(createMatchRepository(client)).getById(matchId)
  if (!match) {
    throw apiError(404, 'NOT_FOUND', 'No match found with that id.')
  }

  const transactions = await createRatingService(
    createRatingRepository(client)
  ).getTransactionsForMatch(matchId)

  if (!transactions.length) {
    return { data: [] }
  }

  const profiles = await createPlayerProfileRepository(client).findByIds([
    ...new Set(transactions.map((t) => t.player_id))
  ])
  const nameById = new Map(profiles.map((p) => [p.id, p.display_name]))

  return {
    data: transactions.map((t) => ({
      player_id: t.player_id,
      display_name: nameById.get(t.player_id) ?? 'Unknown player',
      rating_type: t.rating_type,
      old_rating: t.old_rating,
      new_rating: t.new_rating,
      rating_delta: t.rating_delta,
      created_at: t.created_at
    }))
  }
})
