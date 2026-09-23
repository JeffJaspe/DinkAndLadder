import { serverSupabaseClient } from '#supabase/server'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import { createMatchService } from '~/server/domains/match/services/match.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import {
  createRatingService,
  expectedShare,
  actualShare
} from '~/server/domains/rating/services/rating.service'
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

  // Calculate expected vs actual for explanation tooltips
  const team1Points = match.scores.reduce((sum, s) => sum + s.team1_score, 0)
  const team2Points = match.scores.reduce((sum, s) => sum + s.team2_score, 0)
  const actual = actualShare(team1Points, team2Points)
  const team1Won = actual > 0.5

  // Build old ratings map from transactions to calculate expected share
  const team1Ids = new Set(match.participants.filter((p) => p.team_number === 1).map((p) => p.player_id))
  const team2Ids = new Set(match.participants.filter((p) => p.team_number === 2).map((p) => p.player_id))

  const team1Transactions = transactions.filter((t) => team1Ids.has(t.player_id))
  const team2Transactions = transactions.filter((t) => team2Ids.has(t.player_id))

  const team1OldRatings = team1Transactions.map((t) => t.old_rating ?? 0)
  const team2OldRatings = team2Transactions.map((t) => t.old_rating ?? 0)

  const team1Avg = team1OldRatings.length ? team1OldRatings.reduce((a, b) => a + b, 0) / team1OldRatings.length : 0
  const team2Avg = team2OldRatings.length ? team2OldRatings.reduce((a, b) => a + b, 0) / team2OldRatings.length : 0

  // Check if doubles (2v2)
  const isDoubles = team1Transactions.length === 2 && team2Transactions.length === 2

  // Map player_id to their old rating for individual expected calculation
  const oldRatingById = new Map(transactions.map((t) => [t.player_id, t.old_rating ?? 0]))

  function buildExplanation(playerId: string, delta: number): string {
    const isTeam1 = team1Ids.has(playerId)
    const playerActual = isTeam1 ? actual : 1 - actual
    const won = isTeam1 ? team1Won : !team1Won

    let playerExpected: number
    if (isDoubles) {
      // Doubles: player's expected is their rating vs opponent TEAM average
      const playerRating = oldRatingById.get(playerId) ?? 0
      const opponentAvg = isTeam1 ? team2Avg : team1Avg
      playerExpected = expectedShare(playerRating, opponentAvg)
    } else {
      // Singles: team vs team
      playerExpected = isTeam1 ? expectedShare(team1Avg, team2Avg) : 1 - expectedShare(team1Avg, team2Avg)
    }

    const expectedPct = Math.round(playerExpected * 100)
    const actualPct = Math.round(playerActual * 100)

    if (won && delta < 0) {
      return `Won, but point share (${actualPct}%) was below your expected (${expectedPct}%) vs opponents. Rating adjusts toward true skill level.`
    }
    if (won && delta >= 0) {
      return `Won with ${actualPct}% point share (your expected ${expectedPct}% vs opponents).`
    }
    if (!won && delta > 0) {
      return `Lost, but performed better than expected (${actualPct}% vs your expected ${expectedPct}%).`
    }
    return `Lost with ${actualPct}% point share (your expected ${expectedPct}%).`
  }

  return {
    data: transactions.map((t) => ({
      player_id: t.player_id,
      display_name: nameById.get(t.player_id) ?? 'Unknown player',
      rating_type: t.rating_type,
      old_rating: t.old_rating,
      new_rating: t.new_rating,
      rating_delta: t.rating_delta,
      created_at: t.created_at,
      explanation: buildExplanation(t.player_id, t.rating_delta)
    }))
  }
})
