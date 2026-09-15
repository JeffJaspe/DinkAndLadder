import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventCoOrganizerRecord } from '../dto/event-co-organizer.dto'

const COLUMNS = 'id, event_id, player_id, added_by_player_id, created_at'

export interface EventCoOrganizerRepository {
  listByEvent(eventId: string): Promise<EventCoOrganizerRecord[]>
  /** Events this player co-organises, newest appointment first. */
  listEventIdsByPlayer(playerId: string): Promise<string[]>
  isCoOrganizer(eventId: string, playerId: string): Promise<boolean>
  add(eventId: string, playerId: string, addedByPlayerId: string): Promise<EventCoOrganizerRecord>
  remove(eventId: string, playerId: string): Promise<void>
}

export function createEventCoOrganizerRepository(
  client: SupabaseClient
): EventCoOrganizerRepository {
  return {
    async listByEvent(eventId) {
      const { data, error } = await client
        .from('event_co_organizers')
        .select(COLUMNS)
        .eq('event_id', eventId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as EventCoOrganizerRecord[]
    },

    async listEventIdsByPlayer(playerId) {
      const { data, error } = await client
        .from('event_co_organizers')
        .select('event_id')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as { event_id: string }[]).map((r) => r.event_id)
    },

    async isCoOrganizer(eventId, playerId) {
      const { count, error } = await client
        .from('event_co_organizers')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('player_id', playerId)
      if (error) throw error
      return (count ?? 0) > 0
    },

    async add(eventId, playerId, addedByPlayerId) {
      const { data, error } = await client
        .from('event_co_organizers')
        .insert({ event_id: eventId, player_id: playerId, added_by_player_id: addedByPlayerId })
        .select(COLUMNS)
        .single()
      if (error) throw error
      return data as unknown as EventCoOrganizerRecord
    },

    async remove(eventId, playerId) {
      const { error } = await client
        .from('event_co_organizers')
        .delete()
        .eq('event_id', eventId)
        .eq('player_id', playerId)
      if (error) throw error
    }
  }
}
