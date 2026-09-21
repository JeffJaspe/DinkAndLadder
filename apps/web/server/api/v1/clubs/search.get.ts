import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { toClubSearchResultDto, type ClubSearchQuery } from '~/server/domains/club/dto/club.dto'
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
  const serviceClient = await serverSupabaseServiceRole(event)
  const repository = createClubRepository(client)
  const assets = createBrandingAssetRepository(serviceClient)

  try {
    const rows = await repository.search(query)

    const resolvedClubs = await Promise.all(
      rows.map(async (row) => {
        const [logo_url, cover_photo_url] = await Promise.all([
          row.logo_path ? assets.resolveUrl(row.logo_path) : Promise.resolve(null),
          row.cover_photo_path ? assets.resolveUrl(row.cover_photo_path) : Promise.resolve(null)
        ])
        return toClubSearchResultDto(row, undefined, { logo_url, cover_photo_url })
      })
    )

    return {
      data: resolvedClubs,
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[GET /api/v1/clubs/search] search failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not search clubs.')
  }
})
