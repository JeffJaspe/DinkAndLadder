import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import {
  toPlayerSearchResultDto,
  type PlayerSearchQuery
} from '~/server/domains/player/dto/player-profile.dto'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { apiError } from '~/server/utils/api-error'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string') return fallback
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed
}

/**
 * Public player directory.
 *
 * An unfiltered call is deliberately allowed: "All Provinces" with an empty
 * search box means "show me everyone", and it used to 400 here, which is what
 * made the page render an empty state instead of a directory. The result set
 * is still bounded by MAX_LIMIT and the repository restricts to
 * profile_visibility = 'public', so browsing exposes nothing a search did not.
 */
export default defineEventHandler(async (event) => {
  const rawQuery = getQuery(event)

  const query: PlayerSearchQuery = {
    q: typeof rawQuery.q === 'string' && rawQuery.q.trim() ? rawQuery.q.trim() : undefined,
    province:
      typeof rawQuery.province === 'string' && rawQuery.province.trim()
        ? rawQuery.province.trim()
        : undefined,
    city:
      typeof rawQuery.city === 'string' && rawQuery.city.trim() ? rawQuery.city.trim() : undefined,
    barangay:
      typeof rawQuery.barangay === 'string' && rawQuery.barangay.trim()
        ? rawQuery.barangay.trim()
        : undefined,
    limit: Math.min(parsePositiveInt(rawQuery.limit, DEFAULT_LIMIT), MAX_LIMIT),
    offset: parsePositiveInt(rawQuery.offset, 0)
  }

  const client = await serverSupabaseClient(event)
  const repository = createPlayerProfileRepository(client)

  try {
    const rows = await repository.search(query)

    // Signed avatar URLs, resolved once for the whole page and in parallel.
    // Serially signing a page of a hundred players would put a hundred round
    // trips on the directory's critical path; rows with no photo cost nothing.
    const assets = createBrandingAssetRepository(serverSupabaseServiceRole(event))
    const withPhotos = rows.filter((row) => row.avatar_path)
    const urls = new Map(
      await Promise.all(
        withPhotos.map(
          async (row) => [row.id, await assets.resolveUrl(row.avatar_path!)] as const
        )
      )
    )

    return {
      data: rows.map((row) => ({
        ...toPlayerSearchResultDto(row),
        avatar_url: urls.get(row.id) ?? null
      })),
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[GET /api/v1/players/search] search failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not search players.')
  }
})
