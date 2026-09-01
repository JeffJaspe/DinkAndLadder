import { describe, it, expect, vi } from 'vitest'
import { createRatingBackfillService } from '../../server/domains/rating/services/rating-backfill.service'
import type { MatchRepository } from '../../server/domains/match/repositories/match.repository'
import type { RatingRepository } from '../../server/domains/rating/repositories/rating.repository'
import type { RatingService } from '../../server/domains/rating/services/rating.service'
import type { MatchRecord } from '../../server/domains/match/dto/match.dto'

function makeMatch(id: string, playedAt = '2026-08-01T10:00:00.000Z'): MatchRecord {
  return {
    id,
    match_type: 'doubles',
    status: 'verified',
    submitted_by_player_id: 'player-1',
    event_id: 'event-1',
    affects_rating: true,
    venue: null,
    played_at: playedAt,
    submitted_at: playedAt,
    verified_at: playedAt,
    created_at: playedAt,
    match_participants: [
      { id: `${id}-p1`, match_id: id, player_id: 'player-1', team_number: 1, result_status: 'won' },
      { id: `${id}-p2`, match_id: id, player_id: 'player-2', team_number: 2, result_status: 'lost' }
    ],
    match_scores: [
      { id: `${id}-s1`, match_id: id, set_number: 1, team1_score: 11, team2_score: 9 },
      { id: `${id}-s2`, match_id: id, set_number: 2, team1_score: 11, team2_score: 7 }
    ],
    match_verifications: [],
    match_score_proposals: []
  } as unknown as MatchRecord
}

/** One rating update, which is what "this match was rated" looks like. */
const anUpdate = {
  player_id: 'player-1',
  old_rating: 3.5,
  new_rating: 3.6,
  rating_delta: 0.1
}

function build(options: { page?: MatchRecord[]; alreadyRated?: string[]; apply?: unknown } = {}) {
  const page = options.page ?? [makeMatch('match-1')]
  const alreadyRated = new Set(options.alreadyRated ?? [])

  const findVerifiedForRating = vi.fn().mockResolvedValue(page)
  const applyMatchResult = options.apply ?? vi.fn().mockResolvedValue([anUpdate])
  const hasTransactionsForMatch = vi
    .fn()
    .mockImplementation((id: string) => Promise.resolve(alreadyRated.has(id)))

  const service = createRatingBackfillService(
    { findVerifiedForRating } as unknown as MatchRepository,
    { applyMatchResult } as unknown as RatingService,
    { hasTransactionsForMatch } as unknown as RatingRepository
  )

  return { service, findVerifiedForRating, applyMatchResult, hasTransactionsForMatch }
}

describe('RatingBackfillService', () => {
  it('rates a verified match that has no rating transactions', async () => {
    const { service, applyMatchResult } = build()

    const report = await service.run()

    expect(applyMatchResult).toHaveBeenCalledWith(
      expect.objectContaining({
        match_id: 'match-1',
        rating_type: 'doubles',
        team1_points: 22,
        team2_points: 16
      })
    )
    expect(report).toMatchObject({ scanned: 1, rated: 1, already_rated: 0, failed: 0 })
  })

  /**
   * The whole reason this can be re-run and paged without a lock. If it ever
   * rates a match twice, every player in it gets a doubled delta and the
   * history is permanently wrong — there is no "unrate".
   */
  it('skips a match that was already rated', async () => {
    const { service, applyMatchResult } = build({ alreadyRated: ['match-1'] })

    const report = await service.run()

    expect(applyMatchResult).not.toHaveBeenCalled()
    expect(report).toMatchObject({ scanned: 1, rated: 0, already_rated: 1 })
  })

  it('reports a match the engine could not rate instead of counting it as done', async () => {
    // applyRatingForMatch swallows RatingServiceError and returns [], which is
    // what an unrated participant looks like from here.
    const { service } = build({ apply: vi.fn().mockResolvedValue([]) })

    const report = await service.run()

    expect(report).toMatchObject({ scanned: 1, rated: 0, failed: 1 })
    expect(report.failed_match_ids).toEqual(['match-1'])
  })

  /**
   * Ratings are path-dependent: each match is computed against the rating the
   * player held at the time. Rating them concurrently would race on the same
   * rating row and produce a number no ordering of the real matches could.
   */
  it('rates matches strictly in sequence', async () => {
    const order: string[] = []
    const apply = vi.fn().mockImplementation(async (input: { match_id: string }) => {
      order.push(`start:${input.match_id}`)
      await new Promise((resolve) => setTimeout(resolve, 0))
      order.push(`end:${input.match_id}`)
      return [anUpdate]
    })

    const { service } = build({
      page: [
        makeMatch('match-1', '2026-08-01T10:00:00.000Z'),
        makeMatch('match-2', '2026-08-02T10:00:00.000Z')
      ],
      apply
    })

    await service.run()

    expect(order).toEqual(['start:match-1', 'end:match-1', 'start:match-2', 'end:match-2'])
  })

  it('reports another page when the page came back full', async () => {
    const { service } = build({ page: [makeMatch('match-1'), makeMatch('match-2')] })

    const report = await service.run({ limit: 2, offset: 10 })

    expect(report).toMatchObject({ has_more: true, next_offset: 12 })
  })

  it('reports no more pages when the page came back short', async () => {
    const { service } = build({ page: [makeMatch('match-1')] })

    const report = await service.run({ limit: 50, offset: 0 })

    expect(report).toMatchObject({ has_more: false, next_offset: 1 })
  })

  it('writes nothing on a dry run but still counts the work', async () => {
    const { service, applyMatchResult } = build({
      page: [makeMatch('match-1'), makeMatch('match-2')],
      alreadyRated: ['match-2']
    })

    const report = await service.run({ dryRun: true })

    expect(applyMatchResult).not.toHaveBeenCalled()
    expect(report).toMatchObject({ scanned: 2, rated: 1, already_rated: 1 })
  })
})
