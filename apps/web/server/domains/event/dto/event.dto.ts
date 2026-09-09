import type { TournamentFormat, TournamentMatchType } from './tournament.dto'

export type EventStatus = 'draft' | 'published' | 'active' | 'completed' | 'cancelled'

export type EventVisibility = 'public' | 'registered_only' | 'private'

/**
 * `coaching` is a plain event: no categories, no draw, no ranking, an amount
 * only. It is unrated by construction — `toEventDto` derives affects_rating from
 * an allow-list, so a type is unrated unless deliberately added to it, which is
 * the safe direction for that to fail in.
 */
export type EventType =
  'open_casual' | 'open_ranked' | 'club_casual' | 'club_ranked' | 'tournament' | 'coaching'

/**
 * Who bears the fee.
 *
 * `fee_amount` has always meant "what the player is charged" with no way to say
 * the organiser is covering it. `split` is the case where both pay something,
 * and `organizer_fee_amount` records the organiser's share.
 */
export type EventFeePayer = 'player' | 'organizer' | 'split'

/**
 * `random` is labelled **Mix & Match** everywhere a person can see it — see
 * `utils/queue-mode.ts`. The stored value is unchanged: renaming a column value
 * would mean a migration and a backfill to express something that only ever
 * appears on screen.
 */
export type QueueMode = 'first_come' | 'rating_based' | 'random'

/**
 * How an open play session stops.
 *
 * `manual` waits for the organiser; `scheduled` closes itself at `closes_at`.
 * Distinct from `registration_closes`, which stops new entries rather than
 * ending play — a drop-in session can keep taking players until it is called.
 */
export type EventClosePolicy = 'manual' | 'scheduled'

/**
 * Players needed to start when the organiser has not set a floor of their own:
 * one court's worth. Kept here rather than inline so the API, the UI and the
 * Start button's disabled reason cannot drift apart.
 */
export function defaultMinPlayersToStart(matchFormat: 'singles' | 'doubles'): number {
  return matchFormat === 'singles' ? 2 : 4
}

/** The floor actually in force: the organiser's override, or the format's own. */
export function effectiveMinPlayersToStart(event: {
  min_players_to_start?: number | null
  match_format?: 'singles' | 'doubles' | null
}): number {
  const floor = defaultMinPlayersToStart(event.match_format ?? 'doubles')
  // An override may raise the floor, never drop it below what a court needs —
  // a session that cannot fill one court has nothing to start.
  return Math.max(event.min_players_to_start ?? floor, floor)
}

/**
 * How long after a session ends before an unclosed one is closed for you.
 *
 * Twelve hours, so a session that runs late — or one whose organiser goes home
 * and closes it in the morning — is never taken out from under them, while a
 * session nobody came back to does not sit "open" for days taking registrations
 * for an evening that has already happened.
 */
export const OPEN_PLAY_CLOSE_GRACE_HOURS = 12

/**
 * The moment an unclosed open-play session becomes stale.
 *
 * ASSUMPTION, stated rather than buried: `end_date`/`end_time` carry no time
 * zone (see the EventTime note below), and are read here as UTC. For a session
 * in UTC+8 that makes the sweep fire up to eight hours later than a local
 * reading would — which is the safe direction: it can only ever close a session
 * later than intended, never while somebody is still playing. A `time_zone`
 * column on events would remove the guess; nothing here blocks adding one.
 */
export function staleOpenPlayDeadline(
  event: Pick<EventRecord, 'end_date' | 'end_time'>,
  graceHours: number = OPEN_PLAY_CLOSE_GRACE_HOURS
): Date {
  // No end time is not "ends at midnight UTC": it is "we do not know when it
  // finished", so the grace runs from the end of that day.
  const time = /^\d{2}:\d{2}/.test(event.end_time ?? '') ? event.end_time!.slice(0, 5) : '23:59'
  const ended = new Date(`${event.end_date}T${time}:00Z`)
  return new Date(ended.getTime() + graceHours * 60 * 60 * 1000)
}

/**
 * Wall-clock start/end for an event, `HH:MM` or `HH:MM:SS`.
 *
 * Separate `time` columns rather than timestamps on start_date/end_date: see
 * the note at the top of 028-event-time.changelog.xml. Null on every event
 * created before that migration, and still optional after it — a multi-day
 * tournament often has no single start time worth stating.
 */
export type EventTime = string

export interface EventRecord {
  id: string
  club_id: string
  name: string
  description: string | null
  venue: string | null
  province: string | null
  city: string | null
  start_date: string
  end_date: string
  start_time: EventTime | null
  end_time: EventTime | null
  registration_opens: string | null
  registration_closes: string | null
  status: EventStatus
  visibility: EventVisibility
  event_type: EventType
  fee_amount: number | null
  fee_currency: string | null
  max_participants: number | null
  queue_enabled: boolean
  queue_courts: number
  /** Singles or doubles for open play. See 041-open-play-live. */
  match_format: 'singles' | 'doubles'
  /**
   * How long a game is, for open play. See 054.
   *
   * Mirrors the same three columns on tournament_categories (046) so
   * `rulesForRound` reads one shape whichever record it is handed. A court
   * belongs to an event and not to a category, so without these every open
   * play game was scored against the constant in DEFAULT_GAME_RULES.
   */
  target_points: number
  win_by_two: boolean
  games_default: number
  queue_mode: QueueMode
  /** Override for the floor. Null means derive it from match_format — see 045. */
  min_players_to_start: number | null
  close_policy: EventClosePolicy
  closes_at: string | null
  closed_at: string | null
  /** Who is teaching. Only meaningful on a coaching event. */
  coach_player_id: string | null
  fee_payer: EventFeePayer
  organizer_fee_amount: number | null
  queue_skip_timeout_seconds: number
  /**
   * The wave the session is on. See 052.
   *
   * Session state, not configuration: it moves as courts are restarted and is
   * meaningless before an event is running.
   */
  current_round: number
  created_by_player_id: string
  created_at: string
  updated_at: string
}

export interface EventDto {
  id: string
  club_id: string
  /**
   * The hosting club's name, when the caller asked for a list that resolves it.
   *
   * Undefined means "not looked up", not "no club" — every event has a club, so
   * a card must leave the line out rather than render a blank host. Only the
   * search endpoint populates it; a single-event read already loads the club.
   */
  club_name?: string
  /**
   * Whether that club is platform-verified. Populated alongside `club_name` and
   * undefined for the same reason — the check mark is only ever shown on a host
   * the server actually resolved.
   */
  club_verified?: boolean
  name: string
  description: string | null
  venue: string | null
  province: string | null
  city: string | null
  start_date: string
  end_date: string
  start_time: EventTime | null
  end_time: EventTime | null
  registration_opens: string | null
  registration_closes: string | null
  status: EventStatus
  visibility: EventVisibility
  event_type: EventType
  fee_amount: number | null
  fee_currency: string | null
  max_participants: number | null
  /**
   * Slots taken, or undefined when the caller did not ask for it. Undefined and
   * 0 mean different things — "not counted" versus "nobody has signed up" — so
   * the UI must not collapse them, and this is deliberately not defaulted.
   */
  registered_count?: number
  /**
   * Whether the caller already holds a live registration for this event.
   * Undefined when the request could not identify a caller — "unknown" is not
   * "no", and a card must not tell a signed-out visitor they are not signed up.
   */
  viewer_registered?: boolean
  queue_enabled: boolean
  queue_courts: number
  /** Singles or doubles for open play. See 041-open-play-live. */
  match_format: 'singles' | 'doubles'
  /**
   * How long a game is, for open play. See 054.
   *
   * Mirrors the same three columns on tournament_categories (046) so
   * `rulesForRound` reads one shape whichever record it is handed. A court
   * belongs to an event and not to a category, so without these every open
   * play game was scored against the constant in DEFAULT_GAME_RULES.
   */
  target_points: number
  win_by_two: boolean
  games_default: number
  queue_mode: QueueMode
  min_players_to_start: number | null
  /** The floor actually in force, so a client never re-derives it. */
  effective_min_players_to_start: number
  close_policy: EventClosePolicy
  closes_at: string | null
  closed_at: string | null
  coach_player_id: string | null
  fee_payer: EventFeePayer
  organizer_fee_amount: number | null
  affects_rating: boolean
  /** The wave the session is on. 1 for anything that predates 052. */
  current_round: number
  created_by_player_id: string
  created_at: string
}

export function toEventDto(record: EventRecord): EventDto {
  const affectsRating = ['open_ranked', 'club_ranked', 'tournament'].includes(record.event_type)
  return {
    id: record.id,
    club_id: record.club_id,
    name: record.name,
    description: record.description,
    venue: record.venue,
    province: record.province,
    city: record.city,
    start_date: record.start_date,
    end_date: record.end_date,
    start_time: record.start_time,
    end_time: record.end_time,
    registration_opens: record.registration_opens,
    registration_closes: record.registration_closes,
    status: record.status,
    visibility: record.visibility,
    event_type: record.event_type,
    fee_amount: record.fee_amount,
    fee_currency: record.fee_currency,
    max_participants: record.max_participants,
    queue_enabled: record.queue_enabled,
    queue_courts: record.queue_courts,
    // Defaulted rather than passed through: every event created before 041
    // predates the question, and doubles is what those sessions were.
    match_format: record.match_format ?? 'doubles',
    // Defaulted for the same reason match_format is: every event created
    // before 054 was scored against DEFAULT_GAME_RULES, which is exactly
    // one game to 11, win by two. Reading a null as anything else would
    // restate a finished session's rules after the fact.
    target_points: record.target_points ?? 11,
    win_by_two: record.win_by_two ?? true,
    games_default: record.games_default ?? 1,
    queue_mode: record.queue_mode,
    min_players_to_start: record.min_players_to_start ?? null,
    effective_min_players_to_start: effectiveMinPlayersToStart(record),
    // Defaulted for the same reason match_format is: every event created
    // before 045 predates the question, and none of them was ever closed.
    close_policy: record.close_policy ?? 'manual',
    closes_at: record.closes_at ?? null,
    closed_at: record.closed_at ?? null,
    coach_player_id: record.coach_player_id ?? null,
    // 'player' is what every event created before 048 means today.
    fee_payer: record.fee_payer ?? 'player',
    organizer_fee_amount: record.organizer_fee_amount ?? null,
    affects_rating: affectsRating,
    // Every event created before 052 has never counted a round; it has not
    // finished round one rather than being on round zero.
    current_round: record.current_round ?? 1,
    created_by_player_id: record.created_by_player_id,
    created_at: record.created_at
  }
}

export interface CreateEventInput {
  club_id: string
  name: string
  description?: string | null
  venue?: string | null
  province?: string | null
  city?: string | null
  start_date: string
  end_date: string
  start_time?: EventTime | null
  end_time?: EventTime | null
  registration_opens?: string | null
  registration_closes?: string | null
  visibility?: EventVisibility
  event_type: EventType
  fee_amount?: number | null
  fee_currency?: string | null
  max_participants?: number | null
  queue_enabled?: boolean
  queue_courts?: number
  match_format?: 'singles' | 'doubles'
  /** Game length for open play. See 054; validated in the service. */
  target_points?: number
  win_by_two?: boolean
  games_default?: number
  queue_mode?: QueueMode
  min_players_to_start?: number | null
  close_policy?: EventClosePolicy
  closes_at?: string | null
  coach_player_id?: string | null
  fee_payer?: EventFeePayer
  organizer_fee_amount?: number | null
  /**
   * Only read when event_type is 'tournament', where they configure the one
   * tournament created alongside the event. match_type in particular is not a
   * cosmetic choice: it decides whether registering demands a partner, so
   * guessing it wrong makes every entry fail with PARTNER_REQUIRED.
   */
  tournament_format?: TournamentFormat
  tournament_match_type?: TournamentMatchType
}

/**
 * Every field here is written straight through to the `events` row
 * (`EventRepository.update` spreads it), so this interface must never carry
 * anything that is not a column. The tournament fields on CreateEventInput are
 * deliberately absent for that reason — switching an existing event to a
 * tournament creates one with the defaults.
 */
export interface UpdateEventInput {
  name?: string
  description?: string | null
  venue?: string | null
  province?: string | null
  city?: string | null
  start_date?: string
  end_date?: string
  start_time?: EventTime | null
  end_time?: EventTime | null
  registration_opens?: string | null
  registration_closes?: string | null
  visibility?: EventVisibility
  event_type?: EventType
  fee_amount?: number | null
  fee_currency?: string | null
  max_participants?: number | null
  queue_enabled?: boolean
  queue_courts?: number
  match_format?: 'singles' | 'doubles'
  /** Game length for open play. See 054; validated in the service. */
  target_points?: number
  win_by_two?: boolean
  games_default?: number
  queue_mode?: QueueMode
  min_players_to_start?: number | null
  close_policy?: EventClosePolicy
  closes_at?: string | null
  closed_at?: string | null
  coach_player_id?: string | null
  fee_payer?: EventFeePayer
  organizer_fee_amount?: number | null
}

export interface EventSearchQuery {
  club_id?: string
  province?: string
  city?: string
  /**
   * Free-text search across the fields a person would recognise an event by:
   * its name, its venue and its town.
   *
   * Deliberately not the description — a keyword that matches a paragraph
   * nobody reads produces results the searcher cannot see the reason for, which
   * reads as a broken search rather than a broad one.
   */
  q?: string
  status?: EventStatus
  visibility?: EventVisibility
  event_type?: EventType
  /**
   * Broad kind filter: several event_type values at once. Someone browsing
   * wants "tournaments" or "open play", not one of the four open-play
   * variants. Applied with IN; event_type above still filters to exactly one.
   */
  event_types?: EventType[]
  /**
   * When set, unpublished drafts created by this player are included alongside
   * the public results, so an organiser can see and finish their own drafts.
   * Everyone else's drafts stay hidden — RLS (events_select_own) is the real
   * boundary; this only widens what the query asks for.
   */
  include_drafts_for_player_id?: string
  /**
   * When set, each result carries whether this player is already registered for
   * it. Kept separate from include_drafts_for_player_id: they answer different
   * questions, and a caller may want one without the other.
   */
  viewer_player_id?: string
  /**
   * Whether a cancelled event may appear in an unfiltered listing.
   *
   * Off by default: a cancelled session is not something anybody can turn up
   * to, so it was taking up room in the browse list ahead of events that are
   * actually happening. Asking for `status: 'cancelled'` still returns them —
   * that is a deliberate question, and the record must stay reachable — this
   * only decides what "All statuses" means.
   */
  include_cancelled?: boolean
  limit: number
  offset: number
}

// Event registration types
export type EventRegistrationStatus = 'registered' | 'checked_in' | 'withdrawn'

/**
 * Statuses that occupy a slot. A withdrawal frees the place back up, so it is
 * deliberately excluded — counting it would show an event as full when it is
 * not, which is worse than showing no capacity at all.
 */
export const SLOT_OCCUPYING_STATUSES: EventRegistrationStatus[] = ['registered', 'checked_in']

export interface EventRegistrationRecord {
  id: string
  event_id: string
  player_id: string
  status: EventRegistrationStatus
  registered_at: string
  checked_in_at: string | null
  withdrawn_at: string | null
}

export interface EventRegistrationDto {
  id: string
  event_id: string
  player_id: string
  status: EventRegistrationStatus
  registered_at: string
  checked_in_at: string | null
  player?: {
    id: string
    display_name: string
    rating?: number
  }
}

export function toEventRegistrationDto(
  record: EventRegistrationRecord,
  player?: { id: string; display_name: string; rating?: number }
): EventRegistrationDto {
  return {
    id: record.id,
    event_id: record.event_id,
    player_id: record.player_id,
    status: record.status,
    registered_at: record.registered_at,
    checked_in_at: record.checked_in_at,
    player
  }
}

// Event queue types
export type QueueStatus = 'waiting' | 'matched' | 'playing' | 'completed' | 'skipped' | 'left'

export interface EventQueueRecord {
  id: string
  event_id: string
  player_id: string
  match_type: 'singles' | 'doubles'
  partner_id: string | null
  joined_at: string
  status: QueueStatus
  matched_at: string | null
  court_number: number | null
  match_id: string | null
  opponent_queue_id: string | null
}

export interface EventQueueDto {
  id: string
  event_id: string
  player_id: string
  match_type: 'singles' | 'doubles'
  partner_id: string | null
  joined_at: string
  status: QueueStatus
  court_number: number | null
  player?: {
    id: string
    display_name: string
    rating?: number
  }
  partner?: {
    id: string
    display_name: string
    rating?: number
  }
}

// Event court types
export type CourtStatus = 'available' | 'playing' | 'reserved' | 'maintenance'

/**
 * One game's score while it is still being played.
 *
 * Same shape as match_score_proposals.scores (017), so what a court holds
 * mid-game is exactly what gets submitted when the game ends. Deliberately not
 * stored in match_scores: an unfinished game is not a result, and a matches row
 * carries verification semantics the players are in no position to answer while
 * they are still on court.
 */
export interface LiveGameScore {
  game_number: number
  team1_score: number
  team2_score: number
}

export interface EventCourtRecord {
  id: string
  event_id: string
  court_number: number
  court_name: string | null
  status: CourtStatus
  current_match_id: string | null
  match_started_at: string | null
  live_score: LiveGameScore[] | null
  team1_queue_id: string | null
  team2_queue_id: string | null
  live_score_updated_at: string | null
  /**
   * The wave of the last game STARTED on this court. See 052.
   *
   * Survives the game finishing on purpose: it is what tells the next start
   * whether this court has already had its turn in the current wave.
   */
  round_number: number | null
}

export interface EventCourtDto {
  id: string
  event_id: string
  court_number: number
  court_name: string | null
  status: CourtStatus
  current_match_id: string | null
  match_started_at: string | null
  live_score: LiveGameScore[] | null
  live_score_updated_at: string | null
  /** Who is on court, resolved by the read path. */
  team1: CourtSideDto | null
  team2: CourtSideDto | null
  /** The next queued entries for this court, in order. */
  up_next: CourtSideDto[]
  /** The wave this court is playing, or last played. Null before it has run. */
  round_number: number | null
}

/** One side of a court: a single player, or a pair. */
export interface CourtSideDto {
  queue_id: string
  players: { id: string; display_name: string; rating: number | null }[]
}

export function toEventCourtDto(record: EventCourtRecord): EventCourtDto {
  return {
    id: record.id,
    event_id: record.event_id,
    court_number: record.court_number,
    court_name: record.court_name,
    status: record.status,
    current_match_id: record.current_match_id,
    match_started_at: record.match_started_at,
    live_score: record.live_score,
    live_score_updated_at: record.live_score_updated_at,
    round_number: record.round_number ?? null,
    // Filled in by the read path, which has the queue and profiles to hand.
    team1: null,
    team2: null,
    up_next: []
  }
}
