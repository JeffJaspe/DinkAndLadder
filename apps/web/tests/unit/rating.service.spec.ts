import { describe, expect, it } from 'vitest'
import {
  actualShare,
  clampRating,
  createRatingService,
  decayConfidence,
  expectedShare,
  kFactorFor,
  RatingServiceError,
  recencyWeight,
  resolveMatchTypeWeight
} from '../../server/domains/rating/services/rating.service'
import type { RatingRepository } from '../../server/domains/rating/repositories/rating.repository'
import type { PlayerRatingRecord, RatingType } from '../../server/domains/rating/dto/rating.dto'

function makeRating(
  overrides: Partial<PlayerRatingRecord> & { player_id: string }
): PlayerRatingRecord {
  const now = new Date().toISOString()
  return {
    id: `rating-${overrides.player_id}`,
    rating_type: 'singles',
    rating_value: 3.5,
    confidence_score: 1.0,
    matches_played: 0,
    provisional: true,
    calculated_at: null,
    created_at: now,
    updated_at: now,
    ...overrides
  }
}

function createFakeRatingRepository(seed: PlayerRatingRecord[] = []) {
  const ratings = new Map<string, PlayerRatingRecord>()
  for (const row of seed) ratings.set(`${row.player_id}:${row.rating_type}`, row)
  const ratedMatchIds = new Set<string>()
  const appliedCalls: unknown[] = []

  const repository: RatingRepository = {
    async getRating(playerId, ratingType) {
      return ratings.get(`${playerId}:${ratingType}`) ?? null
    },
    async getRatingsForPlayers(playerIds, ratingType) {
      return playerIds
        .map((id) => ratings.get(`${id}:${ratingType}`))
        .filter((r): r is PlayerRatingRecord => !!r)
    },
    async getRatingHistory() {
      return []
    },
    async hasTransactionsForMatch(matchId) {
      return ratedMatchIds.has(matchId)
    },
    async applyRatingUpdates(matchId, _ratingType, _calculationVersion, updates) {
      ratedMatchIds.add(matchId)
      appliedCalls.push(updates)
    }
  }

  return { repository, ratings, appliedCalls }
}

describe('rating.service pure calculation helpers', () => {
  it('kFactorFor returns the provisional K below the threshold', () => {
    expect(kFactorFor(0)).toBe(0.25)
    expect(kFactorFor(4)).toBe(0.25)
  })

  it('kFactorFor returns the established K at and above the threshold', () => {
    expect(kFactorFor(20)).toBe(0.05)
    expect(kFactorFor(50)).toBe(0.05)
  })

  it('kFactorFor transitions linearly between the two thresholds', () => {
    // Halfway between 5 and 20 (matches_played = 12.5) should be halfway between the K's.
    expect(kFactorFor(12.5)).toBeCloseTo(0.15, 10)
    expect(kFactorFor(5)).toBeCloseTo(0.25, 10)
  })

  it('expectedShare is 0.5 for equal ratings', () => {
    expect(expectedShare(3.5, 3.5)).toBeCloseTo(0.5, 10)
  })

  it('expectedShare is calibrated so a 0.50 gap predicts an 80% share', () => {
    expect(expectedShare(4.0, 3.5)).toBeCloseTo(0.8, 3)
    expect(expectedShare(3.5, 4.0)).toBeCloseTo(0.2, 3)
  })

  it('actualShare divides points normally, and treats 0-0 as neutral', () => {
    expect(actualShare(22, 18)).toBeCloseTo(0.55, 10)
    expect(actualShare(0, 0)).toBe(0.5)
  })

  it('clampRating enforces the [2.000, 8.000] bounds', () => {
    expect(clampRating(1.0)).toBe(2.0)
    expect(clampRating(9.0)).toBe(8.0)
    expect(clampRating(5.5)).toBe(5.5)
  })

  it('decayConfidence multiplies by 0.95 and floors at 0.10', () => {
    expect(decayConfidence(1.0)).toBeCloseTo(0.95, 10)
    expect(decayConfidence(0.1)).toBe(0.1)
    expect(decayConfidence(0.05)).toBe(0.1)
  })

  it('recencyWeight is 1.0 with no elapsed time and 0.5 at the half-life', () => {
    expect(recencyWeight(0)).toBeCloseTo(1.0, 10)
    expect(recencyWeight(180)).toBeCloseTo(0.5, 6)
  })

  it('recencyWeight clamps negative ages to 0 (never boosts a rating above 1.0 weight)', () => {
    expect(recencyWeight(-10)).toBeCloseTo(1.0, 10)
  })

  it('resolveMatchTypeWeight is always 1.0 until Events/Tournaments exist', () => {
    expect(resolveMatchTypeWeight()).toBe(1.0)
  })
})

describe('rating.service applyMatchResult', () => {
  const RATING_TYPE: RatingType = 'doubles'
  const playedAt = new Date().toISOString()

  it('distributes a doubles match delta by confidence weight, matching hand-computed values', async () => {
    const { repository, ratings } = createFakeRatingRepository([
      makeRating({
        player_id: 'a1',
        rating_type: RATING_TYPE,
        rating_value: 3.5,
        confidence_score: 1.0,
        matches_played: 2
      }),
      makeRating({
        player_id: 'a2',
        rating_type: RATING_TYPE,
        rating_value: 3.5,
        confidence_score: 0.25,
        matches_played: 25
      }),
      makeRating({
        player_id: 'b1',
        rating_type: RATING_TYPE,
        rating_value: 3.5,
        confidence_score: 0.25,
        matches_played: 25
      }),
      makeRating({
        player_id: 'b2',
        rating_type: RATING_TYPE,
        rating_value: 3.5,
        confidence_score: 0.25,
        matches_played: 25
      })
    ])
    const service = createRatingService(repository)

    const updates = await service.applyMatchResult({
      match_id: 'match-1',
      rating_type: RATING_TYPE,
      participants: [
        { player_id: 'a1', team_number: 1 },
        { player_id: 'a2', team_number: 1 },
        { player_id: 'b1', team_number: 2 },
        { player_id: 'b2', team_number: 2 }
      ],
      team1_points: 22,
      team2_points: 5,
      played_at: playedAt
    })

    const byId = new Map(updates.map((u) => [u.player_id, u]))
    // Hand-computed: equal team ratings -> expected1 = 0.5 regardless of the scale constant.
    // actual1 = 22/27, matchDelta = actual1 - 0.5 = 0.31481481...
    expect(byId.get('a1')!.rating_delta).toBeCloseTo(0.1259259, 6)
    expect(byId.get('a2')!.rating_delta).toBeCloseTo(0.0062963, 6)
    expect(byId.get('b1')!.rating_delta).toBeCloseTo(-0.0157407, 6)
    expect(byId.get('b2')!.rating_delta).toBeCloseTo(-0.0157407, 6)

    // Every participant's matches_played increments by exactly 1 and confidence decays.
    for (const player of ['a1', 'a2', 'b1', 'b2']) {
      const before = ratings.get(`${player}:${RATING_TYPE}`)!
      const update = byId.get(player)!
      expect(update.new_matches_played).toBe(before.matches_played + 1)
      expect(update.confidence_after).toBeCloseTo(before.confidence_score * 0.95, 10)
    }
  })

  it('treats a singles match as the degenerate one-player-per-team case', async () => {
    const { repository } = createFakeRatingRepository([
      makeRating({
        player_id: 'x',
        rating_type: 'singles',
        rating_value: 3.5,
        confidence_score: 1.0,
        matches_played: 0
      }),
      makeRating({
        player_id: 'y',
        rating_type: 'singles',
        rating_value: 3.5,
        confidence_score: 0.25,
        matches_played: 30
      })
    ])
    const service = createRatingService(repository)

    const updates = await service.applyMatchResult({
      match_id: 'match-singles-1',
      rating_type: 'singles',
      participants: [
        { player_id: 'x', team_number: 1 },
        { player_id: 'y', team_number: 2 }
      ],
      team1_points: 11,
      team2_points: 5,
      played_at: playedAt
    })

    const byId = new Map(updates.map((u) => [u.player_id, u]))
    // matchDelta = 11/16 - 0.5 = 0.1875; singles has no teammate split (weight = 1), so each
    // player's delta is simply their own K-factor times the match delta.
    expect(byId.get('x')!.rating_delta).toBeCloseTo(0.25 * 0.1875, 10)
    expect(byId.get('y')!.rating_delta).toBeCloseTo(-0.05 * 0.1875, 10)
  })

  it('throws PLAYER_UNRATED when a participant has no player_ratings row at all', async () => {
    const { repository } = createFakeRatingRepository([
      makeRating({ player_id: 'x', rating_type: 'singles', rating_value: 3.5 })
    ])
    const service = createRatingService(repository)

    await expect(
      service.applyMatchResult({
        match_id: 'match-2',
        rating_type: 'singles',
        participants: [
          { player_id: 'x', team_number: 1 },
          { player_id: 'unrated-player', team_number: 2 }
        ],
        team1_points: 11,
        team2_points: 5,
        played_at: playedAt
      })
    ).rejects.toMatchObject({ code: 'PLAYER_UNRATED' })
  })

  it('throws PLAYER_UNRATED when a player_ratings row exists but rating_value is null', async () => {
    const { repository } = createFakeRatingRepository([
      makeRating({ player_id: 'x', rating_type: 'singles', rating_value: 3.5 }),
      makeRating({ player_id: 'y', rating_type: 'singles', rating_value: null })
    ])
    const service = createRatingService(repository)

    await expect(
      service.applyMatchResult({
        match_id: 'match-3',
        rating_type: 'singles',
        participants: [
          { player_id: 'x', team_number: 1 },
          { player_id: 'y', team_number: 2 }
        ],
        team1_points: 11,
        team2_points: 5,
        played_at: playedAt
      })
    ).rejects.toBeInstanceOf(RatingServiceError)
  })

  it('throws ALREADY_RATED and does not recompute if the match was already processed', async () => {
    const { repository } = createFakeRatingRepository([
      makeRating({ player_id: 'x', rating_type: 'singles', rating_value: 3.5 }),
      makeRating({ player_id: 'y', rating_type: 'singles', rating_value: 3.5 })
    ])
    const service = createRatingService(repository)
    const input = {
      match_id: 'match-4',
      rating_type: 'singles' as const,
      participants: [
        { player_id: 'x', team_number: 1 as const },
        { player_id: 'y', team_number: 2 as const }
      ],
      team1_points: 11,
      team2_points: 5,
      played_at: playedAt
    }

    await service.applyMatchResult(input)
    await expect(service.applyMatchResult(input)).rejects.toMatchObject({ code: 'ALREADY_RATED' })
  })
})
