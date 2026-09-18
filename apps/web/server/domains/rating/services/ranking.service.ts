import type { RankingRepository } from '../repositories/ranking.repository'
import type {
  RankingEntryDto,
  RankingPageDto,
  RankingQuery,
  RecordRankingEntryDto,
  RecordRankingPageDto
} from '../dto/ranking.dto'
import { toRankingEntryDto } from '../dto/ranking.dto'

export const RANKING_DEFAULT_LIMIT = 50
export const RANKING_MAX_LIMIT = 100

/**
 * Window for the rankings Trend column.
 *
 * Seven days matches the mockup's "from last 7 days" copy on the rating cards,
 * so the same number means the same thing everywhere in the product. It is a
 * named constant rather than a literal because it is a product decision, not an
 * implementation detail — if the rating-cadence rule is ever settled
 * differently (docs/33 open decisions), this is the one place to change.
 */
export const RANKING_TREND_DAYS = 7

export interface RankingService {
  /** A page of rankings with real total count and per-player trend. */
  getRankings(query: RankingQuery): Promise<RankingPageDto>
  /** The same page shape, ranked on results rather than rating. */
  getRecordRankings(query: RankingQuery): Promise<RecordRankingPageDto>
}

export function createRankingService(repository: RankingRepository): RankingService {
  return {
    async getRankings(query) {
      const since = new Date(Date.now() - RANKING_TREND_DAYS * 24 * 60 * 60 * 1000).toISOString()

      // The page and its total are fetched together so the caller can build
      // pagination without a second round trip.
      const [rows, total] = await Promise.all([
        repository.getRankings(query),
        repository.countRankings(query)
      ])

      const deltas = await repository.getTrendDeltas(
        rows.map((row) => row.player_id),
        query.rating_type,
        since
      )

      const data: RankingEntryDto[] = rows.map((row, index) =>
        toRankingEntryDto(
          row,
          query.offset + index + 1,
          query.rating_type,
          // `?? null` rather than `?? 0`: a player with no rated match this week
          // has no trend, which the UI shows differently from "held steady".
          deltas.get(row.player_id) ?? null
        )
      )

      return { data, total, limit: query.limit, offset: query.offset }
    },

    async getRecordRankings(query) {
      const [rows, total] = await Promise.all([
        repository.getRecordRankings(query),
        repository.countRecordRankings(query)
      ])
      const data: RecordRankingEntryDto[] = rows.map((row, index) => ({
        ...row,
        rank: query.offset + index + 1,
        rating_type: query.rating_type
      }))
      return { data, total, limit: query.limit, offset: query.offset }
    }
  }
}
