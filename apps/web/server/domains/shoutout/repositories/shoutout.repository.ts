import type { SupabaseClient } from '@supabase/supabase-js'
import type { ShoutoutRecord } from '../dto/shoutout.dto'

export interface ShoutoutRepository {
  findActiveByPlayerId(playerId: string): Promise<ShoutoutRecord | null>
  findActiveWithPlayer(limit?: number): Promise<Array<ShoutoutRecord & { display_name: string }>>
  create(data: { player_id: string; message: string; expires_at: string }): Promise<ShoutoutRecord>
  update(playerId: string, data: { message: string; expires_at: string }): Promise<ShoutoutRecord | null>
  deactivate(playerId: string): Promise<void>
}

interface ShoutoutJoinRow extends ShoutoutRecord {
  player_profiles?: { display_name?: string | null } | null
}

export function createShoutoutRepository(client: SupabaseClient): ShoutoutRepository {
  return {
    async findActiveByPlayerId(playerId) {
      const { data, error } = await client
        .from('player_shoutouts')
        .select('*')
        .eq('player_id', playerId)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (error) throw error
      return data
    },

    async findActiveWithPlayer(limit = 20) {
      const { data, error } = await client
        .from('player_shoutouts')
        .select(`
          *,
          player_profiles!inner(id, display_name)
        `)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .order('updated_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      // Drop the embedded profile off the result — the DTO carries the flat
      // display_name, not the join.
      return ((data ?? []) as unknown as ShoutoutJoinRow[]).map(
        ({ player_profiles, ...row }) => ({
          ...row,
          display_name: player_profiles?.display_name ?? 'Unknown'
        })
      )
    },

    async create(data) {
      const { data: result, error } = await client
        .from('player_shoutouts')
        .insert({
          player_id: data.player_id,
          message: data.message,
          expires_at: data.expires_at,
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) throw error
      return result
    },

    async update(playerId, data) {
      const { data: result, error } = await client
        .from('player_shoutouts')
        .update({
          message: data.message,
          expires_at: data.expires_at,
          updated_at: new Date().toISOString()
        })
        .eq('player_id', playerId)
        .eq('is_active', true)
        .select()
        .maybeSingle()

      if (error) throw error
      return result
    },

    async deactivate(playerId) {
      const { error } = await client
        .from('player_shoutouts')
        .update({ is_active: false })
        .eq('player_id', playerId)
        .eq('is_active', true)

      if (error) throw error
    }
  }
}
