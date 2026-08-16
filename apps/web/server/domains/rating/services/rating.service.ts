import type { RatingRepository } from '../repositories/rating.repository'
import type { PlayerRatingRecord, RatedMatchInput, RatingUpdateResult } from '../dto/rating.dto'

export class RatingServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

/**
 * ADR-001 (Final Rating Algorithm, docs/18-ADR-INDEX.md) — the base model and RATING_SCALE_S
 * are user-supplied/reviewed (a DUPR-inspired logistic expected-point-share model; the
 * original s=1.15 scaling constant did not actually produce its own stated 80%-at-a-0.50-gap
 * calibration target — verified numerically and corrected to 0.8305 before being adopted here).
 *
 * The K-factor thresholds/values and confidence-decay constants below are NOT decided —
 * confirmed with the user (2026-08-16) that they were invented placeholders in an earlier pass,
 * not reviewed. See ADR-001's "UNCONFIRMED — invented placeholder constants" section before
 * treating this algorithm as production-locked.
 *
 * RATING_ALGORITHM_VERSION must be bumped, never mutated in place, whenever any constant or
 * the shape of the calculation changes — existing rating_transactions rows are permanently
 * stamped with the version that produced them (see 005-rating.changelog.xml's Historical
 * Integrity note); changing behavior under an existing version number would make history lie.
 */
export const RATING_ALGORITHM_VERSION = 1

export const RATING_MIN = 2.0
export const RATING_MAX = 8.0

/** Base-10 logistic scaling constant. Calibrated (and numerically verified) so that a 0.50
 * rating-gap between two teams predicts exactly an 80% expected point share. */
export const RATING_SCALE_S = 0.8305

/** UNCONFIRMED placeholder — not user-reviewed, see ADR-001. */
export const PROVISIONAL_MATCHES_THRESHOLD = 5
/** UNCONFIRMED placeholder — not user-reviewed, see ADR-001. */
export const ESTABLISHED_MATCHES_THRESHOLD = 20
/** UNCONFIRMED placeholder — not user-reviewed, see ADR-001. */
export const K_PROVISIONAL = 0.25
/** UNCONFIRMED placeholder — not user-reviewed, see ADR-001. */
export const K_ESTABLISHED = 0.05

/** UNCONFIRMED placeholder — not user-reviewed, see ADR-001. */
export const CONFIDENCE_PROVISIONAL_DEFAULT = 1.0
/** UNCONFIRMED placeholder — not user-reviewed, see ADR-001. */
export const CONFIDENCE_DECAY_FACTOR = 0.95
/** UNCONFIRMED placeholder — not user-reviewed, see ADR-001. */
export const CONFIDENCE_FLOOR = 0.1

/** UNCONFIRMED placeholder — not user-reviewed, see ADR-001. Half-life of a match's influence,
 * in days, on the (currently near-inert — see below)
 * recency weight. */
const RECENCY_HALF_LIFE_DAYS = 180

/**
 * Only recreational weighting is possible right now — Events/Tournaments (Phase 2) don't
 * exist yet, so there is no way for a match to be anything other than "recreational" in this
 * schema. Revisit once matches can be linked to a league/tournament context; ADR-001 records
 * this as a decided interim default, not an invented final rule.
 */
export function resolveMatchTypeWeight(): number {
  return 1.0
}

/**
 * Time-decay weight for how much a match's outcome should move ratings, based on how long ago
 * it was played relative to when it's actually calculated. In this incremental (not
 * batch-recompute) architecture, matches are rated immediately after verification, so
 * ageInDays is almost always ~0 and this evaluates to ~1.0 in normal operation — it only
 * meaningfully discounts a match whose verification was delayed for weeks. Kept because it's
 * harmless and matches the adopted formula; not expected to matter often in practice.
 */
export function recencyWeight(ageInDays: number): number {
  const lambda = Math.log(2) / RECENCY_HALF_LIFE_DAYS
  return Math.exp(-lambda * Math.max(ageInDays, 0))
}

/** Player volatility (K-factor): higher for newer players so they calibrate faster, linearly
 * transitioning from provisional to established between 5 and 20 matches played. */
export function kFactorFor(matchesPlayed: number): number {
  if (matchesPlayed < PROVISIONAL_MATCHES_THRESHOLD) return K_PROVISIONAL
  if (matchesPlayed >= ESTABLISHED_MATCHES_THRESHOLD) return K_ESTABLISHED
  const progress =
    (matchesPlayed - PROVISIONAL_MATCHES_THRESHOLD) /
    (ESTABLISHED_MATCHES_THRESHOLD - PROVISIONAL_MATCHES_THRESHOLD)
  return K_PROVISIONAL - (K_PROVISIONAL - K_ESTABLISHED) * progress
}

/** Expected share of total points won by team A, as a logistic function of the rating gap. */
export function expectedShare(teamARating: number, teamBRating: number): number {
  return 1 / (1 + Math.pow(10, (teamBRating - teamARating) / RATING_SCALE_S))
}

/** Actual share of total points won by team A. Ties (0-0, e.g. a walkover before any point
 * was scored) are treated as a neutral 50/50 result rather than dividing by zero. */
export function actualShare(pointsA: number, pointsB: number): number {
  const total = pointsA + pointsB
  return total > 0 ? pointsA / total : 0.5
}

export function clampRating(value: number): number {
  return Math.min(Math.max(value, RATING_MIN), RATING_MAX)
}

/** Rating-variance parameter decays toward a floor as a player accumulates matches — this is
 * what the schema/blueprint calls confidence_score, even though a HIGHER value here means LESS
 * confidence (it's a variance, not a 0-1 confidence probability — see the changelog comment). */
export function decayConfidence(confidence: number): number {
  return Math.max(confidence * CONFIDENCE_DECAY_FACTOR, CONFIDENCE_FLOOR)
}

interface TeamMember {
  player_id: string
  rating: number
  confidence: number
  matches_played: number
}

/** Distributes a team's share of the match delta across its members (1 for singles, 2 for
 * doubles), weighted by each member's confidence relative to their teammates'. For a singles
 * "team" of one, the weight is trivially 1 and this reduces to `K_i * matchDelta` — the same
 * per-player magnitude a doubles teammate gets when paired with an equally-confident partner,
 * so singles and doubles players move consistently for an equivalent surprise. */
function distributeTeamDelta(team: TeamMember[], matchDelta: number): RatingUpdateResult[] {
  const totalConfidence = team.reduce((sum, member) => sum + member.confidence, 0)
  return team.map((member) => {
    const weight = member.confidence / totalConfidence
    const delta = team.length * kFactorFor(member.matches_played) * weight * matchDelta
    const newRating = clampRating(member.rating + delta)
    return {
      player_id: member.player_id,
      old_rating: member.rating,
      new_rating: newRating,
      rating_delta: newRating - member.rating,
      confidence_before: member.confidence,
      confidence_after: decayConfidence(member.confidence),
      new_matches_played: member.matches_played + 1
    }
  })
}

export interface RatingService {
  getRating(
    playerId: string,
    ratingType: RatedMatchInput['rating_type']
  ): Promise<PlayerRatingRecord | null>
  getRatingHistory(
    playerId: string,
    ratingType: RatedMatchInput['rating_type']
  ): Promise<import('../dto/rating.dto').RatingTransactionRecord[]>
  applyMatchResult(input: RatedMatchInput): Promise<RatingUpdateResult[]>
}

export function createRatingService(repository: RatingRepository): RatingService {
  return {
    getRating: (playerId, ratingType) => repository.getRating(playerId, ratingType),
    getRatingHistory: (playerId, ratingType) => repository.getRatingHistory(playerId, ratingType),

    async applyMatchResult(input) {
      if (await repository.hasTransactionsForMatch(input.match_id)) {
        throw new RatingServiceError(
          409,
          'ALREADY_RATED',
          'This match has already been processed by the rating engine.'
        )
      }

      const team1Ids = input.participants.filter((p) => p.team_number === 1).map((p) => p.player_id)
      const team2Ids = input.participants.filter((p) => p.team_number === 2).map((p) => p.player_id)

      const ratings = await repository.getRatingsForPlayers(
        [...team1Ids, ...team2Ids],
        input.rating_type
      )
      const ratingByPlayerId = new Map(ratings.map((r) => [r.player_id, r]))

      const toTeamMember = (playerId: string): TeamMember => {
        const record = ratingByPlayerId.get(playerId)
        if (!record || record.rating_value === null) {
          throw new RatingServiceError(
            409,
            'PLAYER_UNRATED',
            `Player ${playerId} has no starting ${input.rating_type} rating yet.`
          )
        }
        return {
          player_id: playerId,
          rating: record.rating_value,
          confidence: record.confidence_score,
          matches_played: record.matches_played
        }
      }

      const team1 = team1Ids.map(toTeamMember)
      const team2 = team2Ids.map(toTeamMember)

      const team1Avg = team1.reduce((sum, m) => sum + m.rating, 0) / team1.length
      const team2Avg = team2.reduce((sum, m) => sum + m.rating, 0) / team2.length

      const expected1 = expectedShare(team1Avg, team2Avg)
      const actual1 = actualShare(input.team1_points, input.team2_points)

      const ageInDays = Math.max(
        (Date.now() - new Date(input.played_at).getTime()) / (1000 * 60 * 60 * 24),
        0
      )
      const matchDelta = resolveMatchTypeWeight() * recencyWeight(ageInDays) * (actual1 - expected1)

      const team1Updates = distributeTeamDelta(team1, matchDelta)
      const team2Updates = distributeTeamDelta(team2, -matchDelta)
      const updates = [...team1Updates, ...team2Updates]

      await repository.applyRatingUpdates(
        input.match_id,
        input.rating_type,
        RATING_ALGORITHM_VERSION,
        updates
      )

      return updates
    }
  }
}
