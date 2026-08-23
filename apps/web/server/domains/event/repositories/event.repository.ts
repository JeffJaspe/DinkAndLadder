import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateEventInput,
  EventRecord,
  EventSearchQuery,
  EventStatus,
  UpdateEventInput
} from '../dto/event.dto'

const EVENT_COLUMNS =
  'id, club_id, name, description, venue, province, city, start_date, end_date, ' +
  'registration_opens, registration_closes, status, visibility, event_type, ' +
  'fee_amount, fee_currency, max_participants, queue_enabled, queue_courts, queue_mode, ' +
  'queue_skip_timeout_seconds, created_by_player_id, created_at, updated_at'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface EventRepository {
  findById(eventId: string): Promise<EventRecord | null>
  create(input: CreateEventInput, createdByPlayerId: string): Promise<EventRecord>
  update(eventId: string, input: UpdateEventInput): Promise<EventRecord>
  updateStatus(eventId: string, status: EventStatus): Promise<EventRecord>
  search(query: EventSearchQuery): Promise<EventRecord[]>
  /**
   * Counts the rows that would block a delete. The FK constraints on events are
   * RESTRICT (no `deleteCascade` exists anywhere in the changelogs), so the
   * service has to know what is attached before it starts removing anything.
   */
  countBlockingChildren(eventId: string): Promise<{
    registrations: number
    matches: number
    queueEntries: number
  }>
  /**
   * Removes an event and everything hanging off it, leaves first.
   *
   * There is no client-side transaction available through PostgREST, so this is
   * a sequence of statements. Deleting leaves before parents means a failure
   * part-way leaves the event still valid and the operation re-runnable, rather
   * than leaving orphaned children behind.
   */
  deleteWithChildren(eventId: string): Promise<void>
}

export function createEventRepository(client: SupabaseClient): EventRepository {
  return {
    async findById(eventId) {
      const { data, error } = await client
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('id', eventId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as EventRecord | null
    },

    async create(input, createdByPlayerId) {
      const { data, error } = await client
        .from('events')
        .insert({
          club_id: input.club_id,
          name: input.name,
          description: input.description ?? null,
          venue: input.venue ?? null,
          province: input.province ?? null,
          city: input.city ?? null,
          start_date: input.start_date,
          end_date: input.end_date,
          registration_opens: input.registration_opens ?? null,
          registration_closes: input.registration_closes ?? null,
          visibility: input.visibility ?? 'public',
          event_type: input.event_type,
          fee_amount: input.fee_amount ?? null,
          fee_currency: input.fee_currency ?? null,
          max_participants: input.max_participants ?? null,
          queue_enabled: input.queue_enabled ?? false,
          queue_courts: input.queue_courts ?? 1,
          queue_mode: input.queue_mode ?? 'first_come',
          status: 'draft',
          created_by_player_id: createdByPlayerId
        })
        .select(EVENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as EventRecord
    },

    async update(eventId, input) {
      const { data, error } = await client
        .from('events')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', eventId)
        .select(EVENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as EventRecord
    },

    async updateStatus(eventId, status) {
      const { data, error } = await client
        .from('events')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', eventId)
        .select(EVENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as EventRecord
    },

    async countBlockingChildren(eventId) {
      const countOf = async (table: string) => {
        const { count, error } = await client
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
        if (error) throw error
        return count ?? 0
      }

      const [registrations, matches, queueEntries] = await Promise.all([
        countOf('event_registrations'),
        countOf('matches'),
        countOf('event_queue')
      ])

      return { registrations, matches, queueEntries }
    },

    async deleteWithChildren(eventId) {
      const { data: tournamentRows, error: tournamentError } = await client
        .from('tournaments')
        .select('id')
        .eq('event_id', eventId)

      if (tournamentError) throw tournamentError
      const tournamentIds = (tournamentRows ?? []).map((t) => t.id as string)

      if (tournamentIds.length > 0) {
        // Leaves first: bracket rows and registrations reference tournaments,
        // categories reference tournaments, tournaments reference the event.
        for (const table of [
          'bracket_matches',
          'tournament_registrations',
          'tournament_categories'
        ]) {
          const { error } = await client.from(table).delete().in('tournament_id', tournamentIds)
          if (error) throw error
        }

        const { error: deleteTournamentsError } = await client
          .from('tournaments')
          .delete()
          .eq('event_id', eventId)
        if (deleteTournamentsError) throw deleteTournamentsError
      }

      // Announcements also point at the event and would otherwise block it.
      const { error: announcementError } = await client
        .from('club_announcements')
        .delete()
        .eq('event_id', eventId)
      if (announcementError) throw announcementError

      const { error } = await client.from('events').delete().eq('id', eventId)
      if (error) throw error
    },

    async search(query) {
      let builder = client.from('events').select(EVENT_COLUMNS)

      // Drafts are hidden from the public listing, but an organiser has to be
      // able to see their own — otherwise an event they created simply vanishes
      // until it is published, with no way back to it. RLS (events_select_own)
      // already restricts this to rows they created; the OR only stops the
      // query from filtering them out before RLS is consulted.
      if (query.include_drafts_for_player_id) {
        // This value is interpolated into a PostgREST filter expression, so it
        // is shape-checked even though it comes from a resolved profile row
        // rather than the request — an unvalidated id here would be a filter
        // injection, the same pattern flagged elsewhere in this codebase.
        if (!UUID_PATTERN.test(query.include_drafts_for_player_id)) {
          throw new Error('include_drafts_for_player_id must be a UUID')
        }
        builder = builder.or(
          `status.neq.draft,created_by_player_id.eq.${query.include_drafts_for_player_id}`
        )
      } else {
        builder = builder.neq('status', 'draft')
      }

      builder = builder.eq('visibility', query.visibility ?? 'public')

      if (query.club_id) {
        builder = builder.eq('club_id', query.club_id)
      }
      if (query.province) {
        builder = builder.eq('province', query.province)
      }
      if (query.city) {
        builder = builder.eq('city', query.city)
      }
      if (query.status) {
        builder = builder.eq('status', query.status)
      }
      if (query.event_type) {
        builder = builder.eq('event_type', query.event_type)
      }

      builder = builder
        .order('start_date', { ascending: true })
        .range(query.offset, query.offset + query.limit - 1)

      const { data, error } = await builder

      if (error) throw error
      return (data ?? []) as unknown as EventRecord[]
    }
  }
}
