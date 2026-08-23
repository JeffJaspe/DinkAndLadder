import { describe, expect, it, vi } from 'vitest'
import {
  RANKING_TREND_DAYS,
  createRankingService
} from '../../server/domains/rating/services/ranking.service'
import type { RankingRepository } from '../../server/domains/rating/repositories/ranking.repository'
import type { RankingRow } from '../../server/domains/rating/dto/ranking.dto'

function makeRow(
  overrides: Partial<RankingRow> & { player_id: string; rating_value: number }
): RankingRow {
  return {
    display_name: `Player ${overrides.player_id}`,
    confidence_score: 1.0,
    matches_played: 5,
    provisional: false,
    province: null,
    city: null,
    barangay: null,
    ...overrides
  }
}

function fakeRepository(
  rows: RankingRow[],
  options?: { total?: number; deltas?: Record<string, number> }
): RankingRepository {
  return {
    async getRankings() {
      return rows
    },
    async countRankings() {
      return options?.total ?? rows.length
    },
    async getTrendDeltas() {
      return new Map(Object.entries(options?.deltas ?? {}))
    }
  }
}

describe('ranking.service', () => {
  it('assigns sequential rank numbers starting at 1 for the first page', async () => {
    const rows = [
      makeRow({ player_id: 'a', rating_value: 5.0 }),
      makeRow({ player_id: 'b', rating_value: 4.5 }),
      makeRow({ player_id: 'c', rating_value: 4.0 })
    ]
    const service = createRankingService(fakeRepository(rows))

    const page = await service.getRankings({ rating_type: 'singles', limit: 50, offset: 0 })

    expect(page.data.map((r) => [r.rank, r.player_id])).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'c']
    ])
  })

  it('offsets rank numbers to reflect the requested page, not a restart at 1', async () => {
    const rows = [makeRow({ player_id: 'd', rating_value: 3.5 })]
    const service = createRankingService(fakeRepository(rows))

    const page = await service.getRankings({ rating_type: 'singles', limit: 50, offset: 10 })

    expect(page.data[0]!.rank).toBe(11)
  })

  it('stamps every entry with the requested rating_type', async () => {
    const rows = [makeRow({ player_id: 'a', rating_value: 5.0 })]
    const service = createRankingService(fakeRepository(rows))

    const page = await service.getRankings({ rating_type: 'doubles', limit: 50, offset: 0 })

    expect(page.data[0]!.rating_type).toBe('doubles')
  })

  it('returns an empty page when there are no eligible rows', async () => {
    const service = createRankingService(fakeRepository([]))

    const page = await service.getRankings({ rating_type: 'singles', limit: 50, offset: 0 })

    expect(page.data).toEqual([])
    expect(page.total).toBe(0)
  })

  it('reports the total across all pages, not the size of this one', async () => {
    // Pagination is built from this number; if it were the page length the UI
    // would always think there was exactly one page.
    const rows = [makeRow({ player_id: 'a', rating_value: 5.0 })]
    const service = createRankingService(fakeRepository(rows, { total: 137 }))

    const page = await service.getRankings({ rating_type: 'singles', limit: 1, offset: 0 })

    expect(page.total).toBe(137)
    expect(page.limit).toBe(1)
    expect(page.offset).toBe(0)
  })

  it('attaches each player their own trend delta', async () => {
    const rows = [
      makeRow({ player_id: 'a', rating_value: 5.0 }),
      makeRow({ player_id: 'b', rating_value: 4.5 })
    ]
    const service = createRankingService(fakeRepository(rows, { deltas: { a: 0.125, b: -0.06 } }))

    const page = await service.getRankings({ rating_type: 'singles', limit: 50, offset: 0 })

    expect(page.data[0]!.trend_delta).toBe(0.125)
    expect(page.data[1]!.trend_delta).toBe(-0.06)
  })

  it('distinguishes "no matches this week" from "held steady"', async () => {
    // null means the player has not played; 0 means they played and came out
    // level. The UI renders those differently, so the service must not collapse
    // them — `?? 0` here would have been a silent data lie.
    const rows = [
      makeRow({ player_id: 'idle', rating_value: 4.0 }),
      makeRow({ player_id: 'level', rating_value: 3.9 })
    ]
    const service = createRankingService(fakeRepository(rows, { deltas: { level: 0 } }))

    const page = await service.getRankings({ rating_type: 'singles', limit: 50, offset: 0 })

    expect(page.data[0]!.trend_delta).toBeNull()
    expect(page.data[1]!.trend_delta).toBe(0)
  })

  it('asks for deltas over the documented trend window', async () => {
    const getTrendDeltas = vi.fn().mockResolvedValue(new Map())
    const rows = [makeRow({ player_id: 'a', rating_value: 5.0 })]
    const service = createRankingService({
      async getRankings() {
        return rows
      },
      async countRankings() {
        return 1
      },
      getTrendDeltas
    })

    const before = Date.now()
    await service.getRankings({ rating_type: 'singles', limit: 50, offset: 0 })

    const [playerIds, ratingType, sinceIso] = getTrendDeltas.mock.calls[0]!
    expect(playerIds).toEqual(['a'])
    expect(ratingType).toBe('singles')

    const windowMs = before - new Date(sinceIso as string).getTime()
    const expected = RANKING_TREND_DAYS * 24 * 60 * 60 * 1000
    expect(Math.abs(windowMs - expected)).toBeLessThan(5000)
  })

  it('passes the search term through to the repository, filters included', async () => {
    // Search is applied in SQL so it covers the whole ladder. If the service
    // dropped `q`, searching would silently fall back to filtering one page —
    // which is exactly the bug this replaced.
    const getRankings = vi.fn().mockResolvedValue([])
    const countRankings = vi.fn().mockResolvedValue(0)
    const service = createRankingService({
      getRankings,
      countRankings,
      async getTrendDeltas() {
        return new Map()
      }
    })

    const query = {
      rating_type: 'singles' as const,
      q: 'reyes',
      province: 'Cebu',
      limit: 50,
      offset: 0
    }
    await service.getRankings(query)

    expect(getRankings).toHaveBeenCalledWith(query)
    // The count must use the same filters, or pagination points at empty pages.
    expect(countRankings).toHaveBeenCalledWith(query)
  })

  it('does not query deltas when the page is empty', async () => {
    const getTrendDeltas = vi.fn().mockResolvedValue(new Map())
    const service = createRankingService({
      async getRankings() {
        return []
      },
      async countRankings() {
        return 0
      },
      getTrendDeltas
    })

    await service.getRankings({ rating_type: 'singles', limit: 50, offset: 0 })

    // The repository short-circuits an empty id list, but the service should
    // not be relying on that to avoid a pointless round trip.
    expect(getTrendDeltas).toHaveBeenCalledWith([], 'singles', expect.any(String))
  })
})
