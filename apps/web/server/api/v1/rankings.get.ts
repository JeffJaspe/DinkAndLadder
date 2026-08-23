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
    q: typeof rawQuery.q === 'string' && rawQuery.q.trim() ? rawQuery.q.trim() : undefined,
    limit,
    offset
  }

  const client = await serverSupabaseClient(event)
  const service = createRankingService(createRankingRepository(client))

  try {
    const page = await service.getRankings(query)
    // `data` keeps the same shape every existing caller reads. `meta.total` is
    // new and is what lets the UI build real pagination instead of a fixed row
    // of buttons.
    return {
      data: page.data,
      meta: {
        rating_type: query.rating_type,
        limit,
        offset,
        count: page.data.length,
        total: page.total
      }
    }
  } catch (err) {
    // Without this the raw error escaped as an unhandled 500, and because
    // community.vue awaits this in setup that killed the whole page render — a
    // transient database hiccup produced a blank screen instead of an empty
    // rankings table.
    console.error('[GET /api/v1/rankings] getRankings failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load rankings right now.')
  }
})
