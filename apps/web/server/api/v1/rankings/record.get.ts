import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createRankingRepository } from '~/server/domains/rating/repositories/ranking.repository'
import {
  createRankingService,
  RANKING_DEFAULT_LIMIT,
  RANKING_MAX_LIMIT
} from '~/server/domains/rating/services/ranking.service'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
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
 * The ladder by results — wins, losses and win percentage — with the same
 * query contract as /api/v1/rankings so the page can switch between the two
 * without changing a filter. Public, like the rating ladder: the view it
 * reads (v_player_records, 071) already limits itself to public profiles and
 * to counts.
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
  const assets = createBrandingAssetRepository(serverSupabaseServiceRole(event))
  const service = createRankingService(createRankingRepository(client))

  const resolveAvatars = async (paths: Map<string, string | null>) => {
    const entries = [...paths.entries()].filter(([, path]) => Boolean(path))
    const resolved = await Promise.all(
      entries.map(async ([id, path]) => [id, await assets.resolveUrl(path!)] as const)
    )
    return new Map(resolved)
  }

  try {
    const page = await service.getRecordRankings(query, resolveAvatars)
    return {
      data: page.data,
      meta: { rating_type: query.rating_type, limit, offset, total: page.total },
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[GET /api/v1/rankings/record] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load the rankings.')
  }
})
