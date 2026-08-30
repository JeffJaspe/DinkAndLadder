import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventCourtRecord, CourtStatus, LiveGameScore } from '../dto/event.dto'

const COURT_COLUMNS =
  'id, event_id, court_number, court_name, status, current_match_id, match_started_at, ' +
  'live_score, team1_queue_id, team2_queue_id, live_score_updated_at'

export interface EventCourtRepository {
  listByEvent(eventId: string): Promise<EventCourtRecord[]>
  findById(courtId: string): Promise<EventCourtRecord | null>
  /**
   * Creates the court rows for an event from its `queue_courts` count.
   *
   * Idempotent: an event that is started, completed and started again must not
   * end up with two sets of courts. Courts that already exist are left exactly
   * as they are.
   */
  ensureCourts(eventId: string, courtCount: number): Promise<EventCourtRecord[]>
  update(
    courtId: string,
    patch: {
      status?: CourtStatus
      current_match_id?: string | null
      match_started_at?: string | null
      live_score?: LiveGameScore[] | null
      team1_queue_id?: string | null
      team2_queue_id?: string | null
      live_score_updated_at?: string | null
    }
  ): Promise<EventCourtRecord>
}

export function createEventCourtRepository(client: SupabaseClient): EventCourtRepository {
  return {
    async listByEvent(eventId) {
      const { data, error } = await client
        .from('event_courts')
        .select(COURT_COLUMNS)
        .eq('event_id', eventId)
        .order('court_number', { ascending: true })

      if (error) throw error
      return (data ?? []) as unknown as EventCourtRecord[]
    },

    async findById(courtId) {
      const { data, error } = await client
        .from('event_courts')
        .select(COURT_COLUMNS)
        .eq('id', courtId)
        .maybeSingle()

      if (error) throw error
      return (data as unknown as EventCourtRecord) ?? null
    },

    async ensureCourts(eventId, courtCount) {
      const existing = await this.listByEvent(eventId)
      const have = new Set(existing.map((c) => c.court_number))

      const missing = []
      for (let number = 1; number <= courtCount; number++) {
        if (!have.has(number)) {
          missing.push({ event_id: eventId, court_number: number, status: 'available' })
        }
      }

      if (missing.length === 0) return existing

      const { error } = await client.from('event_courts').insert(missing)
      if (error) throw error

      // Re-read rather than merging in memory: the insert does not return the
      // defaulted columns in court_number order, and the caller renders a board.
      return this.listByEvent(eventId)
    },

    async update(courtId, patch) {
      const { data, error } = await client
        .from('event_courts')
        .update(patch)
        .eq('id', courtId)
        .select(COURT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as EventCourtRecord
    }
  }
}
