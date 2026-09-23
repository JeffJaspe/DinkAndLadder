import { escapeLikePattern } from '../../shared/escape-like'
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
  'start_time, end_time, ' +
  'registration_opens, registration_closes, status, visibility, event_type, ' +
  'fee_amount, fee_currency, max_participants, queue_enabled, queue_courts, queue_mode, match_format, ' +
  'target_points, win_by_two, games_default, ' +
  'min_players_to_start, close_policy, closes_at, closed_at, ' +
  'restricted_at, restricted_reason, ' +
  'coach_player_id, fee_payer, organizer_fee_amount, ' +
  'queue_skip_timeout_seconds, current_round, created_by_player_id, created_at, updated_at'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface EventRepository {
  findById(eventId: string): Promise<EventRecord | null>
  /**
   * Whether the creator appointed this player a co-organiser (061). Optional
   * on the interface so the many in-memory fakes in the unit tests need not
   * grow it; a repository without it simply knows no co-organisers, which is
   * exactly what the schema had before 061.
   */
  isCoOrganizer?(eventId: string, playerId: string): Promise<boolean>
  /**
   * Whether this player is active staff (owner, admin, moderator) of the club
   * hosting the event — the same rule the API layer's `assertCanRunEvent`
   * applies to open play. Optional for the same reason as `isCoOrganizer`.
   */
  isClubStaff?(eventId: string, playerId: string): Promise<boolean>
  create(input: CreateEventInput, createdByPlayerId: string): Promise<EventRecord>
  update(eventId: string, input: UpdateEventInput): Promise<EventRecord>
  updateStatus(eventId: string, status: EventStatus): Promise<EventRecord>
  /**
   * Moves the session on to a new wave. See 052.
   *
   * Its own method rather than a field on UpdateEventInput: the round is
   * session state that only the court service is allowed to move, and putting
   * it on the general update input would let any organiser edit form set it.
   */
  setCurrentRound(eventId: string, round: number): Promise<EventRecord>
  search(query: EventSearchQuery): Promise<EventRecord[]>
  /**
   * Open-play sessions still running on or before a given date, which nobody
   * has closed.
   *
   * Deliberately coarse — it filters on `end_date` only, because the hour of
   * the deadline depends on `end_time` and that is business logic, not a query
   * (see EventService.autoCloseStaleOpenPlay, which applies the grace period to
   * each row it gets back). Bounded so one sweep cannot pull an unbounded
   * result set out of the table.
   */
  findOpenPlayAwaitingClose(onOrBeforeDate: string, limit: number): Promise<EventRecord[]>
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
  /**
   * How many events a club is holding, split the two ways the limits care
   * about: drafts (unpublished, however many types) and live events per type.
   *
   * `tournament` counts on its own; every other event type is open play as far
   * as a player is concerned (see the split in pages/index.vue), so they are
   * counted together.
   */
  countByClubForLimits(clubId: string): Promise<{
    drafts: number
    liveTournaments: number
    liveOpenPlay: number
  }>
  /**
   * The club's unfinished events, oldest first, for deciding what survives a
   * downgrade.
   *
   * Oldest first is the whole point: on a lapse the OLDEST unfinished event of
   * each type stays live and the rest are restricted. The club's longest-standing
   * commitment is the one with players already registered, and taking that one
   * away would be the platform breaking a promise the club made.
   *
   * Completed and cancelled events are excluded — they have had their weekend
   * and cannot be restricted into anything meaningful.
   */
  findRestrictableForClub(clubId: string): Promise<EventRecord[]>
  /**
   * Marks events restricted, or clears the mark when `reason` is null.
   *
   * Restricted, NOT cancelled: `status` is untouched, so every existing query
   * still sees the event exactly as it did. Restriction is a separate nullable
   * timestamp precisely so a billing state cannot leak into the event's own
   * lifecycle.
   */
  setRestricted(eventIds: string[], reason: 'plan_downgrade' | null): Promise<number>
}

export function createEventRepository(client: SupabaseClient): EventRepository {
  return {
    async isCoOrganizer(eventId, playerId) {
      const { count, error } = await client
        .from('event_co_organizers')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('player_id', playerId)
      if (error) throw error
      return (count ?? 0) > 0
    },

    async isClubStaff(eventId, playerId) {
      const { data: eventRow } = await client
        .from('events')
        .select('club_id')
        .eq('id', eventId)
        .maybeSingle()
      const clubId = (eventRow as { club_id: string | null } | null)?.club_id
      if (!clubId) return false

      const { data, error } = await client
        .from('club_memberships')
        .select('role')
        .eq('club_id', clubId)
        .eq('player_id', playerId)
        .eq('status', 'active')
        .in('role', ['OWNER', 'ADMIN', 'MODERATOR'])
        .maybeSingle()
      if (error) throw error
      return !!data
    },

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
          start_time: input.start_time ?? null,
          end_time: input.end_time ?? null,
          registration_opens: input.registration_opens ?? null,
          registration_closes: input.registration_closes ?? null,
          visibility: input.visibility ?? 'public',
          event_type: input.event_type,
          fee_amount: input.fee_amount ?? null,
          fee_currency: input.fee_currency ?? null,
          max_participants: input.max_participants ?? null,
          queue_enabled: input.queue_enabled ?? false,
          queue_courts: input.queue_courts ?? 1,
          match_format: input.match_format ?? 'doubles',
          // The defaults restate DEFAULT_GAME_RULES, which is what every
          // session created before 054 was scored against.
          target_points: input.target_points ?? 11,
          win_by_two: input.win_by_two ?? true,
          games_default: input.games_default ?? 1,
          queue_mode: input.queue_mode ?? 'first_come',
          // Null means "derive the floor from the format" — see 045. Only a
          // deliberate override is stored.
          min_players_to_start: input.min_players_to_start ?? null,
          close_policy: input.close_policy ?? 'manual',
          // Only meaningful under a scheduled policy; a manual session that
          // carried a stray time would look like it closes itself.
          closes_at: input.close_policy === 'scheduled' ? (input.closes_at ?? null) : null,
          coach_player_id: input.coach_player_id ?? null,
          fee_payer: input.fee_payer ?? 'player',
          // Only meaningful on a split; carrying a figure on a player-pays
          // event would make it look part-funded when it is not.
          organizer_fee_amount:
            input.fee_payer === 'split' ? (input.organizer_fee_amount ?? null) : null,
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

    async setCurrentRound(eventId, round) {
      const { data, error } = await client
        .from('events')
        .update({ current_round: round, updated_at: new Date().toISOString() })
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

    async countByClubForLimits(clubId) {
      // One read rather than three counts: a club has tens of events, not
      // thousands, and three round trips to answer one question is worse.
      const { data, error } = await client
        .from('events')
        .select('status, event_type')
        .eq('club_id', clubId)
        .neq('status', 'cancelled')

      if (error) throw error

      const rows = (data ?? []) as Array<{ status: string; event_type: string }>
      return {
        drafts: rows.filter((r) => r.status === 'draft').length,
        // "Live" means it has been put in front of players. A completed event
        // has had its weekend and must not block the next one.
        liveTournaments: rows.filter(
          (r) =>
            ['tournament', 'tournament_casual', 'tournament_club'].includes(r.event_type) &&
            (r.status === 'published' || r.status === 'active')
        ).length,
        liveOpenPlay: rows.filter(
          (r) =>
            !['tournament', 'tournament_casual', 'tournament_club'].includes(r.event_type) &&
            (r.status === 'published' || r.status === 'active')
        ).length
      }
    },

    async findRestrictableForClub(clubId) {
      const { data, error } = await client
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('club_id', clubId)
        .in('status', ['draft', 'published', 'active'])
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data ?? []) as unknown as EventRecord[]
    },

    async setRestricted(eventIds, reason) {
      // An empty list is a legitimate outcome of "restrict everything past the
      // first" when a club has only one event, and `.in('id', [])` would be a
      // pointless round trip.
      if (eventIds.length === 0) return 0

      const { data, error } = await client
        .from('events')
        .update({
          restricted_at: reason === null ? null : new Date().toISOString(),
          restricted_reason: reason,
          updated_at: new Date().toISOString()
        })
        .in('id', eventIds)
        .select('id')

      if (error) throw error
      return (data ?? []).length
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

    async findOpenPlayAwaitingClose(onOrBeforeDate, limit) {
      const { data, error } = await client
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('status', 'active')
        .is('closed_at', null)
        .in('event_type', ['open_casual', 'open_ranked', 'club_casual', 'club_ranked'])
        .lte('end_date', onOrBeforeDate)
        .order('end_date', { ascending: true })
        .limit(limit)

      if (error) throw error
      return (data ?? []) as unknown as EventRecord[]
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
      /**
       * One term, three columns, OR'd together.
       *
       * `escapeLikePattern` because a searcher typing `%` means a percent sign,
       * not "match anything" — the same reason club and player search escape
       * theirs. The commas and dots PostgREST uses as its own separators cannot
       * appear unescaped either, so the term is bracketed in `"` inside the
       * filter expression.
       */
      if (query.q?.trim()) {
        const term = escapeLikePattern(query.q.trim()).replace(/"/g, '')
        builder = builder.or(
          `name.ilike."%${term}%",venue.ilike."%${term}%",city.ilike."%${term}%"`
        )
      }
      if (query.province) {
        builder = builder.eq('province', query.province)
      }
      if (query.city) {
        builder = builder.eq('city', query.city)
      }
      if (query.status) {
        builder = builder.eq('status', query.status)
      } else if (!query.include_cancelled) {
        // Nobody can turn up to a cancelled session, so it does not belong in
        // a browse list beside the ones that are happening. Only skipped for an
        // unfiltered listing: `status: 'cancelled'` above is somebody asking
        // for them on purpose, and is answered.
        builder = builder.neq('status', 'cancelled')
      }
      if (query.event_type) {
        builder = builder.eq('event_type', query.event_type)
      }
      // Broad kind filter. Empty list is not the same as absent - it would be a
      // filter that can only match nothing - so it is ignored rather than sent.
      if (query.event_types?.length) {
        builder = builder.in('event_type', query.event_types)
      }

      // Newest first, deliberately.
      //
      // This was ascending, which sorts the whole table oldest-first and then
      // takes the first 20 — so page one of an unfiltered list was the twenty
      // oldest events in the database, every one of them long finished. That
      // is what "the All Status filter only shows completed" was: the filter
      // was correct and the ordering was hiding everything current behind
      // pages of history.
      //
      // `id` breaks the tie so paging is stable when several events share a
      // start date, which seeded and same-day events routinely do.
      builder = builder
        .order('start_date', { ascending: false })
        .order('id', { ascending: false })
        .range(query.offset, query.offset + query.limit - 1)

      const { data, error } = await builder

      if (error) throw error
      return (data ?? []) as unknown as EventRecord[]
    }
  }
}
