import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  EventRegistrationRecord,
  EventRegistrationStatus
} from '../dto/event.dto'

export interface EventRegistrationRepository {
  findByEventAndPlayer(
    eventId: string,
    playerId: string
  ): Promise<EventRegistrationRecord | null>
  findByEvent(
    eventId: string,
    status?: EventRegistrationStatus[]
  ): Promise<EventRegistrationRecord[]>
  findByPlayer(playerId: string): Promise<EventRegistrationRecord[]>
  countByEvent(eventId: string, status?: EventRegistrationStatus[]): Promise<number>
  create(data: {
    event_id: string
    player_id: string
    status?: EventRegistrationStatus
  }): Promise<EventRegistrationRecord>
  updateStatus(
    id: string,
    status: EventRegistrationStatus
  ): Promise<EventRegistrationRecord | null>
  checkIn(id: string): Promise<EventRegistrationRecord | null>
  withdraw(id: string): Promise<EventRegistrationRecord | null>
}

export function createEventRegistrationRepository(
  client: SupabaseClient
): EventRegistrationRepository {
  return {
    async findByEventAndPlayer(eventId, playerId) {
      const { data, error } = await client
        .from('event_registrations')
        .select('*')
        .eq('event_id', eventId)
        .eq('player_id', playerId)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to find registration: ${error.message}`)
      }
      return data as EventRegistrationRecord | null
    },

    async findByEvent(eventId, status) {
      let query = client
        .from('event_registrations')
        .select('*')
        .eq('event_id', eventId)

      if (status && status.length > 0) {
        query = query.in('status', status)
      }

      const { data, error } = await query.order('registered_at', { ascending: true })

      if (error) {
        throw new Error(`Failed to list registrations: ${error.message}`)
      }
      return (data ?? []) as EventRegistrationRecord[]
    },

    async findByPlayer(playerId) {
      const { data, error } = await client
        .from('event_registrations')
        .select('*')
        .eq('player_id', playerId)
        .order('registered_at', { ascending: false })

      if (error) {
        throw new Error(`Failed to list player registrations: ${error.message}`)
      }
      return (data ?? []) as EventRegistrationRecord[]
    },

    async countByEvent(eventId, status) {
      let query = client
        .from('event_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)

      if (status && status.length > 0) {
        query = query.in('status', status)
      }

      const { count, error } = await query

      if (error) {
        throw new Error(`Failed to count registrations: ${error.message}`)
      }
      return count ?? 0
    },

    async create(data) {
      const { data: created, error } = await client
        .from('event_registrations')
        .insert({
          event_id: data.event_id,
          player_id: data.player_id,
          status: data.status ?? 'registered'
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to create registration: ${error.message}`)
      }
      return created as EventRegistrationRecord
    },

    async updateStatus(id, status) {
      const updates: Record<string, unknown> = { status }

      if (status === 'checked_in') {
        updates.checked_in_at = new Date().toISOString()
      } else if (status === 'withdrawn') {
        updates.withdrawn_at = new Date().toISOString()
      }

      const { data, error } = await client
        .from('event_registrations')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to update registration: ${error.message}`)
      }
      return data as EventRegistrationRecord
    },

    async checkIn(id) {
      return this.updateStatus(id, 'checked_in')
    },

    async withdraw(id) {
      return this.updateStatus(id, 'withdrawn')
    }
  }
}
