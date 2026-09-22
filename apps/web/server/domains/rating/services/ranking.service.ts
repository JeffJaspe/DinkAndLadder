import type { RankingRepository } from '../repositories/ranking.repository'
import type {
  RankingEntryDto,
  RankingPageDto,
  RankingQuery,
  RankingRow,
  RecordRankingEntryDto,
  RecordRankingPageDto,
  RecordRankingRow
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

/** Resolves avatar paths to signed URLs in parallel. */
export type AvatarResolver = (paths: Map<string, string | null>) => Promise<Map<string, string | null>>

export interface RankingService {
  /** A page of rankings with real total count and per-player trend. */
  getRankings(query: RankingQuery, resolveAvatars?: AvatarResolver): Promise<RankingPageDto>
  /** The same page shape, ranked on results rather than rating. */
  getRecordRankings(query: RankingQuery, resolveAvatars?: AvatarResolver): Promise<RecordRankingPageDto>
}

export function createRankingService(repository: RankingRepository): RankingService {
  async function resolveAvatarUrls<T extends { player_id: string }>(
    rows: (T & { avatar_path: string | null })[],
    resolver?: AvatarResolver
  ): Promise<Map<string, string | null>> {
    if (!resolver) return new Map()
    const paths = new Map(rows.map((r) => [r.player_id, r.avatar_path]))
    return resolver(paths)
  }

  return {
    async getRankings(query, resolveAvatars) {
      const since = new Date(Date.now() - RANKING_TREND_DAYS * 24 * 60 * 60 * 1000).toISOString()

      const [rows, total] = await Promise.all([
        repository.getRankings(query),
        repository.countRankings(query)
      ])

      const [deltas, avatarUrls] = await Promise.all([
        repository.getTrendDeltas(
          rows.map((row) => row.player_id),
          query.rating_type,
          since
        ),
        resolveAvatarUrls(rows, resolveAvatars)
      ])

      const data: RankingEntryDto[] = rows.map((row, index) =>
        toRankingEntryDto(
          row,
          query.offset + index + 1,
          query.rating_type,
          deltas.get(row.player_id) ?? null,
          avatarUrls.get(row.player_id) ?? null
        )
      )

      return { data, total, limit: query.limit, offset: query.offset }
    },

    async getRecordRankings(query, resolveAvatars) {
      const [rows, total] = await Promise.all([
        repository.getRecordRankings(query),
        repository.countRecordRankings(query)
      ])

      const avatarUrls = await resolveAvatarUrls(rows, resolveAvatars)

      const data: RecordRankingEntryDto[] = rows.map((row, index) => {
        const { avatar_path: _, ...rest } = row
        return {
          ...rest,
          rank: query.offset + index + 1,
          rating_type: query.rating_type,
          avatar_url: avatarUrls.get(row.player_id) ?? null
        }
      })
      return { data, total, limit: query.limit, offset: query.offset }
    }
  }
}
