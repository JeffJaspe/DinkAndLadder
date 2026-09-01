import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeLikePattern } from '../../shared/escape-like'
import type {
  PlayerProfileRecord,
  PlayerSearchQuery,
  PlayerSearchResultRow,
  UpdatePlayerProfileInput
} from '../dto/player-profile.dto'

const PROFILE_COLUMNS =
  'id, user_id, display_name, first_name, last_name, bio, province, city, barangay, ' +
  'dominant_hand, preferred_position, profile_visibility, created_at, updated_at'

export interface PlayerProfileRepository {
  findById(profileId: string): Promise<PlayerProfileRecord | null>
  findByUserId(userId: string): Promise<PlayerProfileRecord | null>
  /** Bulk name lookup — avoids N round trips when resolving a list of player ids. */
  findByIds(profileIds: string[]): Promise<PlayerProfileRecord[]>
  upsertOwnProfile(userId: string, input: UpdatePlayerProfileInput): Promise<PlayerProfileRecord>
  search(query: PlayerSearchQuery): Promise<PlayerSearchResultRow[]>
}

/**
 * The spellings of NCR seen in this database, or null when the value is an
 * ordinary province.
 *
 * Exported so a test can assert the list rather than rediscover it, and so the
 * next place that filters on province can reuse it instead of inventing a
 * second list that drifts from this one.
 */
export const NCR_PROVINCE_ALIASES = [
  'NCR (National Capital Region)',
  'National Capital Region',
  'NCR',
  'Metro Manila'
] as const

export function ncrAliasesFor(province: string): string[] | null {
  const normalised = province.trim().toLowerCase()
  const isNcr = NCR_PROVINCE_ALIASES.some((alias) => alias.toLowerCase() === normalised)
  return isNcr ? [...NCR_PROVINCE_ALIASES] : null
}

export function createPlayerProfileRepository(client: SupabaseClient): PlayerProfileRepository {
  return {
    async findById(profileId) {
      const { data, error } = await client
        .from('player_profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', profileId)
        .maybeSingle()

      if (error) throw error
      return data as PlayerProfileRecord | null
    },

    async findByIds(profileIds) {
      if (!profileIds.length) return []
      const { data, error } = await client
        .from('player_profiles')
        .select(PROFILE_COLUMNS)
        .in('id', profileIds)

      if (error) throw error
      return (data ?? []) as unknown as PlayerProfileRecord[]
    },

    async findByUserId(userId) {
      const { data, error } = await client
        .from('player_profiles')
        .select(PROFILE_COLUMNS)
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw error
      return data as PlayerProfileRecord | null
    },

    async upsertOwnProfile(userId, input) {
      const { data, error } = await client
        .from('player_profiles')
        .upsert(
          { user_id: userId, ...input, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
        .select(PROFILE_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as PlayerProfileRecord
    },

    async search(query) {
      let builder = client
        .from('player_profiles')
        .select('id, display_name, province, city, barangay, profile_visibility')
        .eq('profile_visibility', 'public')

      if (query.q) {
        builder = builder.ilike('display_name', `%${escapeLikePattern(query.q)}%`)
      }
      if (query.province) {
        /**
         * NCR is a region, not a province, and it has been written down several
         * ways: the location picker offers "NCR (National Capital Region)",
         * while profiles created another way carry "NCR", "National Capital
         * Region" or "Metro Manila". An equality match on the picker's label
         * therefore returned nothing at all for the one filter people reach for
         * most, which is what "the NCR filter is not working" was.
         *
         * Only NCR gets this treatment. Every real province has exactly one
         * spelling in the PSGC list, so widening the match for all of them
         * would trade a correct filter for a fuzzy one.
         */
        const aliases = ncrAliasesFor(query.province)
        if (aliases) {
          builder = builder.in('province', aliases)
        } else {
          builder = builder.eq('province', query.province)
        }
      }
      if (query.city) {
        builder = builder.eq('city', query.city)
      }
      if (query.barangay) {
        builder = builder.eq('barangay', query.barangay)
      }

      builder = builder
        .order('display_name', { ascending: true })
        .range(query.offset, query.offset + query.limit - 1)

      const { data, error } = await builder

      if (error) throw error

      const rows = data ?? []
      const playerIds = rows.map((row: Record<string, unknown>) => row.id as string)

      // singles_rating/doubles_rating were previously hardcoded to null here —
      // this was the "no rating shown in player search" bug. Batch-fetch the
      // ratings for the page of results just returned, rather than N+1.
      const ratingsByPlayer = new Map<string, { singles: number | null; doubles: number | null }>()
      if (playerIds.length > 0) {
        const { data: ratingRows, error: ratingsError } = await client
          .from('player_ratings')
          .select('player_id, rating_type, rating_value')
          .in('player_id', playerIds)
          .in('rating_type', ['singles', 'doubles'])

        if (ratingsError) throw ratingsError

        for (const r of ratingRows ?? []) {
          const entry = ratingsByPlayer.get(r.player_id) ?? { singles: null, doubles: null }
          if (r.rating_type === 'singles') entry.singles = r.rating_value
          else if (r.rating_type === 'doubles') entry.doubles = r.rating_value
          ratingsByPlayer.set(r.player_id, entry)
        }
      }

      return rows.map((row: Record<string, unknown>) => {
        const ratings = ratingsByPlayer.get(row.id as string)
        return {
          id: row.id as string,
          user_id: '',
          display_name: row.display_name as string,
          first_name: null,
          last_name: null,
          bio: null,
          province: row.province as string | null,
          city: row.city as string | null,
          barangay: row.barangay as string | null,
          dominant_hand: null,
          preferred_position: null,
          profile_visibility: row.profile_visibility as 'public' | 'private',
          created_at: '',
          updated_at: '',
          singles_rating: ratings?.singles ?? null,
          doubles_rating: ratings?.doubles ?? null
        }
      }) as PlayerSearchResultRow[]
    }
  }
}
