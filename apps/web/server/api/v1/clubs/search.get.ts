import { serverSupabaseClient } from '#supabase/server'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { toClubSearchResultDto, type ClubSearchQuery } from '~/server/domains/club/dto/club.dto'
import { apiError } from '~/server/utils/api-error'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string') return fallback
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed
}

/**
 * Public club directory ("Discover Clubs").
 *
 * An unfiltered call lists clubs rather than 400ing. The old guard required one
 * of q/province/city, which is why selecting "All Provinces" produced an empty
 * screen instead of every club. The repository already restricts to
 * visibility = 'public' AND status = 'active' and pages with .range(), so an
 * unfiltered browse is both bounded and no broader than a search was.
 *
 * `verified=true` narrows to clubs the platform has verified — it replaces the
 * old standalone /verified-clubs page, which now redirects here.
 */
export default defineEventHandler(async (event) => {
  const rawQuery = getQuery(event)

  const query: ClubSearchQuery = {
    q: typeof rawQuery.q === 'string' && rawQuery.q.trim() ? rawQuery.q.trim() : undefined,
    province:
      typeof rawQuery.province === 'string' && rawQuery.province.trim()
        ? rawQuery.province.trim()
        : undefined,
    city:
      typeof rawQuery.city === 'string' && rawQuery.city.trim() ? rawQuery.city.trim() : undefined,
    verified: rawQuery.verified === 'true' || rawQuery.verified === '1',
    limit: Math.min(parsePositiveInt(rawQuery.limit, DEFAULT_LIMIT), MAX_LIMIT),
    offset: parsePositiveInt(rawQuery.offset, 0)
  }

  const client = await serverSupabaseClient(event)
  const repository = createClubRepository(client)

  try {
    const rows = await repository.search(query)
    return {
      data: rows.map((row) => toClubSearchResultDto(row)),
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[GET /api/v1/clubs/search] search failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not search clubs.')
  }
})
