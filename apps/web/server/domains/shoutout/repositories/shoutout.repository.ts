import type { SupabaseClient } from '@supabase/supabase-js'
import type { ShoutoutRecord } from '../dto/shoutout.dto'

export interface ShoutoutRepository {
  findActiveByPlayerId(playerId: string): Promise<ShoutoutRecord | null>
  create(data: {
    player_id: string
    message: string
    expires_at: string
    event_id?: string | null
  }): Promise<ShoutoutRecord>
  update(
    playerId: string,
    data: { message: string; expires_at: string; event_id?: string | null }
  ): Promise<ShoutoutRecord | null>
  /** Event ids this player may attach: ones they created or are registered for. */
  listLinkableEventIds(playerId: string): Promise<Set<string>>
  deactivate(playerId: string): Promise<void>
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

    async create(data) {
      const { data: result, error } = await client
        .from('player_shoutouts')
        .insert({
          player_id: data.player_id,
          message: data.message,
          expires_at: data.expires_at,
          event_id: data.event_id ?? null,
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
          event_id: data.event_id ?? null,
          updated_at: new Date().toISOString()
        })
        .eq('player_id', playerId)
        .eq('is_active', true)
        .select()
        .maybeSingle()

      if (error) throw error
      return result
    },

    async listLinkableEventIds(playerId) {
      // Two sources, one round trip each: events this player created, and
      // events they hold a live registration for. Anything else is somebody
      // else's event, and attaching it would let a shout-out advertise an
      // event its poster has nothing to do with.
      const [created, registered] = await Promise.all([
        client.from('events').select('id').eq('created_by_player_id', playerId),
        client
          .from('event_registrations')
          .select('event_id')
          .eq('player_id', playerId)
          .in('status', ['registered', 'checked_in'])
      ])

      if (created.error) throw created.error
      if (registered.error) throw registered.error

      const ids = new Set<string>()
      for (const row of (created.data ?? []) as { id: string }[]) ids.add(row.id)
      for (const row of (registered.data ?? []) as { event_id: string }[]) ids.add(row.event_id)
      return ids
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
