import type { RankingRepository } from '../repositories/ranking.repository'
import type { RankingEntryDto, RankingQuery } from '../dto/ranking.dto'
import { toRankingEntryDto } from '../dto/ranking.dto'

export const RANKING_DEFAULT_LIMIT = 50
export const RANKING_MAX_LIMIT = 100

export interface RankingService {
  getRankings(query: RankingQuery): Promise<RankingEntryDto[]>
}

export function createRankingService(repository: RankingRepository): RankingService {
  return {
    async getRankings(query) {
      const rows = await repository.getRankings(query)
      return rows.map((row, index) =>
        toRankingEntryDto(row, query.offset + index + 1, query.rating_type)
      )
    }
  }
}
