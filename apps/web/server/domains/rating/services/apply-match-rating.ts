import type { RatingType, RatingUpdateResult } from '../dto/rating.dto'
import { RatingServiceError, type RatingService } from './rating.service'

/**
 * The shape a match has to have before it can be rated. Deliberately narrower
 * than MatchDto: both callers hold a different type (the verification endpoint
 * a MatchDto, the bracket service a MatchRecord), and neither needs to know
 * about the other's.
 */
export interface RatableMatch {
  id: string
  match_type: RatingType
  played_at: string
  participants: Array<{ player_id: string; team_number: 1 | 2 }>
  scores: Array<{ team1_score: number; team2_score: number }>
}

/**
 * Applies a verified match to its participants' ratings.
 *
 * This lived as a private function inside
 * `api/v1/matches/[matchId]/verification/decision.post.ts`, which made it
 * unreachable from anywhere else — and that was the whole bug. A match becomes
 * `verified` down two separate paths, and only one of them went through that
 * endpoint:
 *
 *   1. a player-submitted match, once its verifiers confirm it
 *      (MatchService.resolveStatus → decision.post.ts), and
 *   2. an organiser recording a draw result
 *      (BracketService.recordMatchResult, which writes 'verified' directly and
 *      correctly — asking the pair who just lost to confirm the bracket would
 *      be backwards).
 *
 * Path 2 never rated anything. Every tournament match ever recorded left the
 * players' ratings untouched and wrote no rating history, which is why a player
 * with a full tournament record still shows an empty progress chart. Living in
 * the rating domain, this is now callable from both.
 *
 * Best-effort by design, unchanged from the original: verification (or
 * recording a draw result) is a complete, successful domain action in its own
 * right by the time this runs, so a rating failure must never fail it or roll
 * it back. The most likely failure — PLAYER_UNRATED — is a known gap: the
 * initial-rating questionnaire (ADR-001) does not exist yet, so a brand-new
 * player has no seeded rating to update from. Whatever eventually seeds those
 * ratings is also responsible for replaying this for any match that failed
 * here; `applyMatchResult` is idempotent (see hasTransactionsForMatch), so
 * replaying it is always safe, and so is backfilling the tournament matches
 * that path 2 missed.
 *
 * @returns the rating updates, for activity/notification logging — or an empty
 * array when the calculation could not run.
 */
export async function applyRatingForMatch(
  service: RatingService,
  match: RatableMatch
): Promise<RatingUpdateResult[]> {
  const team1Points = match.scores.reduce((sum, s) => sum + s.team1_score, 0)
  const team2Points = match.scores.reduce((sum, s) => sum + s.team2_score, 0)

  try {
    const updates = await service.applyMatchResult({
      match_id: match.id,
      rating_type: match.match_type,
      participants: match.participants.map((p) => ({
        player_id: p.player_id,
        team_number: p.team_number
      })),
      team1_points: team1Points,
      team2_points: team2Points,
      played_at: match.played_at
    })
    return updates ?? []
  } catch (err) {
    if (err instanceof RatingServiceError) {
      console.warn(`[match ${match.id}] rating calculation skipped: ${err.code} — ${err.message}`)
      return []
    }
    console.error(`[match ${match.id}] rating calculation failed unexpectedly:`, err)
    return []
  }
}
