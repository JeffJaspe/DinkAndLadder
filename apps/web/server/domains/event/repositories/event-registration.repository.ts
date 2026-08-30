import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventRegistrationRecord, EventRegistrationStatus } from '../dto/event.dto'

export interface EventRegistrationRepository {
  findByEventAndPlayer(eventId: string, playerId: string): Promise<EventRegistrationRecord | null>
  findByEvent(
    eventId: string,
    status?: EventRegistrationStatus[]
  ): Promise<EventRegistrationRecord[]>
  findByPlayer(playerId: string): Promise<EventRegistrationRecord[]>
  countByEvent(eventId: string, status?: EventRegistrationStatus[]): Promise<number>
  /**
   * Registration counts for many events at once, keyed by event id. Events
   * with no registrations are absent from the map.
   *
   * Exists so the events list does not fire one count per card — a listing of
   * 20 events would otherwise be 21 round trips.
   */
  countByEvents(
    eventIds: string[],
    status?: EventRegistrationStatus[]
  ): Promise<Map<string, number>>
  /**
   * Which of `eventIds` this player holds a registration for.
   *
   * Answers "am I in this one?" for a whole listing in a single round trip.
   * Withdrawn rows are excluded by the caller's status filter, so a player who
   * withdrew reads as not registered.
   */
  findRegisteredEventIds(
    playerId: string,
    eventIds: string[],
    status?: EventRegistrationStatus[]
  ): Promise<Set<string>>
  create(data: {
    event_id: string
    player_id: string
    status?: EventRegistrationStatus
    /**
     * Who did the registering, when it was not the player themselves — the
     * team-up owner bringing them to a session. Null for a self-registration,
     * which is every row that existed before rosters.
     */
    registered_by_player_id?: string | null
  }): Promise<EventRegistrationRecord>
  updateStatus(id: string, status: EventRegistrationStatus): Promise<EventRegistrationRecord | null>
  /**
   * Put a withdrawn registration back.
   *
   * (event_id, player_id) is UNIQUE (uq_event_registrations_event_player, 017),
   * so withdrawing and signing up again could not insert a second row — it
   * failed the constraint and surfaced as a 500. The row is reused instead,
   * and withdrawn_at is cleared: leaving it set would make an active
   * registration look withdrawn to anything reading that column.
   *
   * registered_at is refreshed too, because queue order is first-come and
   * keeping the original timestamp would hand back a place in the queue that
   * was given up.
   */
  reinstate(id: string): Promise<EventRegistrationRecord | null>
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
      let query = client.from('event_registrations').select('*').eq('event_id', eventId)

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

    async countByEvents(eventIds, status) {
      const counts = new Map<string, number>()
      if (!eventIds.length) return counts

      // Rows are fetched and tallied in application code because Supabase's
      // REST layer has no GROUP BY. Only the event_id column is selected, so
      // the payload stays small even for a busy event.
      let query = client.from('event_registrations').select('event_id').in('event_id', eventIds)

      if (status && status.length > 0) {
        query = query.in('status', status)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(`Failed to count registrations: ${error.message}`)
      }

      for (const row of (data ?? []) as { event_id: string }[]) {
        counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1)
      }
      return counts
    },

    async findRegisteredEventIds(playerId, eventIds, status) {
      const ids = new Set<string>()
      if (!eventIds.length) return ids

      let query = client
        .from('event_registrations')
        .select('event_id')
        .eq('player_id', playerId)
        .in('event_id', eventIds)

      if (status && status.length > 0) {
        query = query.in('status', status)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(`Failed to load player registrations: ${error.message}`)
      }

      for (const row of (data ?? []) as { event_id: string }[]) {
        ids.add(row.event_id)
      }
      return ids
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
          status: data.status ?? 'registered',
          registered_by_player_id: data.registered_by_player_id ?? null
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

    async reinstate(id) {
      const { data, error } = await client
        .from('event_registrations')
        .update({
          status: 'registered',
          withdrawn_at: null,
          registered_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to reinstate registration: ${error.message}`)
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
