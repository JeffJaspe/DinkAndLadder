import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PlayerProfileRecord,
  PlayerSearchQuery,
  PlayerSearchResultRow,
  UpdatePlayerProfileInput
} from '../dto/player-profile.dto'

const PROFILE_COLUMNS =
  'id, user_id, display_name, first_name, last_name, bio, province, city, ' +
  'dominant_hand, preferred_position, profile_visibility, created_at, updated_at'

export interface PlayerProfileRepository {
  findById(profileId: string): Promise<PlayerProfileRecord | null>
  findByUserId(userId: string): Promise<PlayerProfileRecord | null>
  upsertOwnProfile(userId: string, input: UpdatePlayerProfileInput): Promise<PlayerProfileRecord>
  search(query: PlayerSearchQuery): Promise<PlayerSearchResultRow[]>
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
        .select('id, display_name, province, city, profile_visibility')
        .eq('profile_visibility', 'public')

      if (query.q) {
        builder = builder.ilike('display_name', `%${query.q}%`)
      }
      if (query.province) {
        builder = builder.eq('province', query.province)
      }
      if (query.city) {
        builder = builder.eq('city', query.city)
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
