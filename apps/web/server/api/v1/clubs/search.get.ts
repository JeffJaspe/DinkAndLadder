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
    limit: Math.min(parsePositiveInt(rawQuery.limit, DEFAULT_LIMIT), MAX_LIMIT),
    offset: parsePositiveInt(rawQuery.offset, 0)
  }

  if (!query.q && !query.province && !query.city) {
    throw apiError(400, 'VALIDATION_ERROR', 'Provide at least one of: q, province, or city.')
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
