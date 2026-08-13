import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlayerProfileRecord, UpdatePlayerProfileInput } from '../dto/player-profile.dto'

const PROFILE_COLUMNS =
  'id, user_id, display_name, first_name, last_name, bio, province, city, ' +
  'dominant_hand, preferred_position, profile_visibility, created_at, updated_at'

export interface PlayerProfileRepository {
  findById(profileId: string): Promise<PlayerProfileRecord | null>
  findByUserId(userId: string): Promise<PlayerProfileRecord | null>
  upsertOwnProfile(userId: string, input: UpdatePlayerProfileInput): Promise<PlayerProfileRecord>
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
      return data as PlayerProfileRecord
    }
  }
}
