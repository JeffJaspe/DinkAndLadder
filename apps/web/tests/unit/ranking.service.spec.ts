import { describe, expect, it } from 'vitest'
import { createRankingService } from '../../server/domains/rating/services/ranking.service'
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
    ...overrides
  }
}

function fakeRepository(rows: RankingRow[]): RankingRepository {
  return {
    async getRankings() {
      return rows
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

    const result = await service.getRankings({ rating_type: 'singles', limit: 50, offset: 0 })

    expect(result.map((r) => [r.rank, r.player_id])).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'c']
    ])
  })

  it('offsets rank numbers to reflect the requested page, not a restart at 1', async () => {
    const rows = [makeRow({ player_id: 'd', rating_value: 3.5 })]
    const service = createRankingService(fakeRepository(rows))

    const result = await service.getRankings({ rating_type: 'singles', limit: 50, offset: 10 })

    expect(result[0].rank).toBe(11)
  })

  it('stamps every entry with the requested rating_type', async () => {
    const rows = [makeRow({ player_id: 'a', rating_value: 5.0 })]
    const service = createRankingService(fakeRepository(rows))

    const result = await service.getRankings({ rating_type: 'doubles', limit: 50, offset: 0 })

    expect(result[0].rating_type).toBe('doubles')
  })

  it('returns an empty array when there are no eligible rows', async () => {
    const service = createRankingService(fakeRepository([]))

    const result = await service.getRankings({ rating_type: 'singles', limit: 50, offset: 0 })

    expect(result).toEqual([])
  })
})
