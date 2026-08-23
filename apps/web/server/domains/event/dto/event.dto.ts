export type EventStatus = 'draft' | 'published' | 'active' | 'completed' | 'cancelled'

export type EventVisibility = 'public' | 'registered_only' | 'private'

export type EventType = 'open_casual' | 'open_ranked' | 'club_casual' | 'club_ranked' | 'tournament'

export type QueueMode = 'first_come' | 'rating_based' | 'random'

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
  queue_mode: QueueMode
  queue_skip_timeout_seconds: number
  created_by_player_id: string
  created_at: string
  updated_at: string
}

export interface EventDto {
  id: string
  club_id: string
  name: string
  description: string | null
  venue: string | null
  province: string | null
  city: string | null
  start_date: string
  end_date: string
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
  queue_mode: QueueMode
  affects_rating: boolean
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
    queue_mode: record.queue_mode,
    affects_rating: affectsRating,
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
  registration_opens?: string | null
  registration_closes?: string | null
  visibility?: EventVisibility
  event_type: EventType
  fee_amount?: number | null
  fee_currency?: string | null
  max_participants?: number | null
  queue_enabled?: boolean
  queue_courts?: number
  queue_mode?: QueueMode
}

export interface UpdateEventInput {
  name?: string
  description?: string | null
  venue?: string | null
  province?: string | null
  city?: string | null
  start_date?: string
  end_date?: string
  registration_opens?: string | null
  registration_closes?: string | null
  visibility?: EventVisibility
  event_type?: EventType
  fee_amount?: number | null
  fee_currency?: string | null
  max_participants?: number | null
  queue_enabled?: boolean
  queue_courts?: number
  queue_mode?: QueueMode
}

export interface EventSearchQuery {
  club_id?: string
  province?: string
  city?: string
  status?: EventStatus
  visibility?: EventVisibility
  event_type?: EventType
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

export interface EventCourtRecord {
  id: string
  event_id: string
  court_number: number
  court_name: string | null
  status: CourtStatus
  current_match_id: string | null
  match_started_at: string | null
}

export interface EventCourtDto {
  id: string
  event_id: string
  court_number: number
  court_name: string | null
  status: CourtStatus
  current_match_id: string | null
  match_started_at: string | null
}
