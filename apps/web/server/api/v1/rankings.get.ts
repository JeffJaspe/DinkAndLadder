import { serverSupabaseClient } from '#supabase/server'
import { createRankingRepository } from '~/server/domains/rating/repositories/ranking.repository'
import {
  createRankingService,
  RANKING_DEFAULT_LIMIT,
  RANKING_MAX_LIMIT
} from '~/server/domains/rating/services/ranking.service'
import { apiError } from '~/server/utils/api-error'
import type { RankingQuery } from '~/server/domains/rating/dto/ranking.dto'

function parsePositiveInt(value: unknown, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'limit/offset must be non-negative integers.')
  }
  return parsed
}

/**
 * No auth required — same public-by-default posture as player_ratings/public player profiles.
 * See ADR-003 (docs/18-ADR-INDEX.md) for what eligibility filtering is and isn't applied.
 */
export default defineEventHandler(async (event) => {
  const rawQuery = getQuery(event)

  if (rawQuery.rating_type !== 'singles' && rawQuery.rating_type !== 'doubles') {
    throw apiError(
      400,
      'VALIDATION_ERROR',
      "query param 'rating_type' must be 'singles' or 'doubles'."
    )
  }

  const limit = Math.min(parsePositiveInt(rawQuery.limit, RANKING_DEFAULT_LIMIT), RANKING_MAX_LIMIT)
  const offset = parsePositiveInt(rawQuery.offset, 0)

  const query: RankingQuery = {
    rating_type: rawQuery.rating_type,
    province: typeof rawQuery.province === 'string' ? rawQuery.province : undefined,
    city: typeof rawQuery.city === 'string' ? rawQuery.city : undefined,
    barangay: typeof rawQuery.barangay === 'string' ? rawQuery.barangay : undefined,
    limit,
    offset
  }

  const client = await serverSupabaseClient(event)
  const service = createRankingService(createRankingRepository(client))
  const data = await service.getRankings(query)

  return { data, meta: { rating_type: query.rating_type, limit, offset, count: data.length } }
})
