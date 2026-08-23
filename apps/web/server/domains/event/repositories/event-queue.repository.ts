import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventQueueRecord, QueueStatus } from '../dto/event.dto'

export interface EventQueueRepository {
  findById(id: string): Promise<EventQueueRecord | null>
  findByEventAndPlayer(eventId: string, playerId: string): Promise<EventQueueRecord | null>
  findWaiting(eventId: string, matchType?: 'singles' | 'doubles'): Promise<EventQueueRecord[]>
  findByEvent(eventId: string): Promise<EventQueueRecord[]>
  create(data: {
    event_id: string
    player_id: string
    match_type: 'singles' | 'doubles'
    partner_id?: string | null
  }): Promise<EventQueueRecord>
  updateStatus(id: string, status: QueueStatus): Promise<EventQueueRecord | null>
  setMatched(
    id: string,
    courtNumber: number,
    opponentQueueId: string
  ): Promise<EventQueueRecord | null>
  setPlaying(id: string, matchId: string): Promise<EventQueueRecord | null>
  leave(id: string): Promise<void>
}

export function createEventQueueRepository(client: SupabaseClient): EventQueueRepository {
  return {
    async findById(id) {
      const { data, error } = await client.from('event_queue').select('*').eq('id', id).single()

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to find queue entry: ${error.message}`)
      }
      return data as EventQueueRecord | null
    },

    async findByEventAndPlayer(eventId, playerId) {
      const { data, error } = await client
        .from('event_queue')
        .select('*')
        .eq('event_id', eventId)
        .eq('player_id', playerId)
        .in('status', ['waiting', 'matched', 'playing'])
        .single()

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to find queue entry: ${error.message}`)
      }
      return data as EventQueueRecord | null
    },

    async findWaiting(eventId, matchType) {
      let query = client
        .from('event_queue')
        .select('*')
        .eq('event_id', eventId)
        .eq('status', 'waiting')

      if (matchType) {
        query = query.eq('match_type', matchType)
      }

      const { data, error } = await query.order('joined_at', { ascending: true })

      if (error) {
        throw new Error(`Failed to list waiting queue: ${error.message}`)
      }
      return (data ?? []) as EventQueueRecord[]
    },

    async findByEvent(eventId) {
      const { data, error } = await client
        .from('event_queue')
        .select('*')
        .eq('event_id', eventId)
        .in('status', ['waiting', 'matched', 'playing'])
        .order('joined_at', { ascending: true })

      if (error) {
        throw new Error(`Failed to list queue: ${error.message}`)
      }
      return (data ?? []) as EventQueueRecord[]
    },

    async create(data) {
      const { data: created, error } = await client
        .from('event_queue')
        .insert({
          event_id: data.event_id,
          player_id: data.player_id,
          match_type: data.match_type,
          partner_id: data.partner_id ?? null,
          status: 'waiting'
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to join queue: ${error.message}`)
      }
      return created as EventQueueRecord
    },

    async updateStatus(id, status) {
      const { data, error } = await client
        .from('event_queue')
        .update({ status })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to update queue status: ${error.message}`)
      }
      return data as EventQueueRecord
    },

    async setMatched(id, courtNumber, opponentQueueId) {
      const { data, error } = await client
        .from('event_queue')
        .update({
          status: 'matched',
          matched_at: new Date().toISOString(),
          court_number: courtNumber,
          opponent_queue_id: opponentQueueId
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to set matched: ${error.message}`)
      }
      return data as EventQueueRecord
    },

    async setPlaying(id, matchId) {
      const { data, error } = await client
        .from('event_queue')
        .update({
          status: 'playing',
          match_id: matchId
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to set playing: ${error.message}`)
      }
      return data as EventQueueRecord
    },

    async leave(id) {
      const { error } = await client.from('event_queue').update({ status: 'left' }).eq('id', id)

      if (error) {
        throw new Error(`Failed to leave queue: ${error.message}`)
      }
    }
  }
}
