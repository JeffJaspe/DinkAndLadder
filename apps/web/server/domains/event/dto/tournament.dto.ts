/**
 * The five formats the generator can draw.
 *
 * `pool_play` was renamed to `round_robin_single_elimination` in Liquibase
 * 031-tournament-format. It always was a round-robin group stage feeding a
 * single-elimination knockout, and the vague name only became actively
 * misleading once `round_robin_double_elimination` sat beside it.
 *
 * Labels and descriptions live in `~/utils/tournament-formats`, which is the
 * one place that maps these values to words. Keep the two in step — the test in
 * `tests/unit/tournament-formats.spec.ts` fails if they drift.
 */
export type TournamentFormat =
  | 'round_robin'
  | 'single_elimination'
  | 'double_elimination'
  | 'round_robin_single_elimination'
  | 'round_robin_double_elimination'

export type TournamentMatchType = 'singles' | 'doubles'

export type TournamentStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled'

export interface TournamentRecord {
  id: string
  event_id: string
  name: string
  format: TournamentFormat
  match_type: TournamentMatchType
  min_rating: number | null
  max_rating: number | null
  max_participants: number | null
  status: TournamentStatus
  /** The category-less path's lock — see resolveBracketLock. */
  bracket_locked_at: string | null
  bracket_locked_by_player_id: string | null
  created_at: string
  updated_at: string
}

export interface TournamentDto {
  id: string
  event_id: string
  name: string
  format: TournamentFormat
  match_type: TournamentMatchType
  min_rating: number | null
  max_rating: number | null
  max_participants: number | null
  status: TournamentStatus
  bracket_locked_at: string | null
  created_at: string
}

export function toTournamentDto(record: TournamentRecord): TournamentDto {
  return {
    id: record.id,
    event_id: record.event_id,
    name: record.name,
    format: record.format,
    match_type: record.match_type,
    min_rating: record.min_rating,
    max_rating: record.max_rating,
    max_participants: record.max_participants,
    status: record.status,
    bracket_locked_at: record.bracket_locked_at,
    created_at: record.created_at
  }
}

export interface CreateTournamentInput {
  event_id: string
  name: string
  format?: TournamentFormat
  match_type: TournamentMatchType
  min_rating?: number | null
  max_rating?: number | null
  max_participants?: number | null
}

export interface UpdateTournamentInput {
  name?: string
  format?: TournamentFormat
  min_rating?: number | null
  max_rating?: number | null
  max_participants?: number | null
}

export type RegistrationStatus = 'pending' | 'confirmed' | 'waitlisted' | 'withdrawn' | 'rejected'

/**
 * The statuses that actually hold a place in a category.
 *
 * `withdrawn` and `rejected` do not: a player who pulled out, or whom the
 * organiser turned away, has released their slot and must be free to enter
 * again. Everything that asks "who is in this category" — the one-entry
 * invariant, the partner picker, the capacity count — uses this list, and so
 * does `fn_assert_one_entry_per_category` in Liquibase 032. Keep the two in
 * step: the trigger is the backstop for exactly this rule.
 *
 * Getting `rejected` wrong here is not academic. It would leave a rejected
 * entry blocking its own players forever, and would stop an organiser rejecting
 * one half of a duplicate pair — the very cleanup the invariant exists to
 * enable.
 */
export const SLOT_HOLDING_REGISTRATION_STATUSES: RegistrationStatus[] = [
  'pending',
  'confirmed',
  'waitlisted'
]

export interface TournamentRegistrationRecord {
  id: string
  tournament_id: string
  player_id: string
  partner_player_id: string | null
  status: RegistrationStatus
  registered_at: string
  confirmed_at: string | null
  created_at: string
  category_id: string | null
}

export interface TournamentRegistrationDto {
  id: string
  tournament_id: string
  player_id: string
  partner_player_id: string | null
  status: RegistrationStatus
  registered_at: string
  confirmed_at: string | null
  category_id: string | null
}

export function toTournamentRegistrationDto(
  record: TournamentRegistrationRecord
): TournamentRegistrationDto {
  return {
    id: record.id,
    tournament_id: record.tournament_id,
    player_id: record.player_id,
    partner_player_id: record.partner_player_id,
    status: record.status,
    registered_at: record.registered_at,
    confirmed_at: record.confirmed_at,
    category_id: record.category_id
  }
}

export interface RegisterForTournamentInput {
  partner_player_id?: string | null
  category_id?: string | null
}

/**
 * A registration with the player's name resolved.
 *
 * The base TournamentRegistrationDto carries only ids, which is all the bracket
 * generator needs — but any screen listing who has entered has to show names,
 * and previously had nothing to show. Kept as a separate type so the id-only
 * read stays cheap for the paths that don't need the join.
 */
export interface TournamentRegistrationWithPlayerDto extends TournamentRegistrationDto {
  display_name: string
  rating: number | null
  partner_display_name: string | null
}

/**
 * Which of a player's two ratings this entry is judged by.
 *
 * A doubles category is contested in doubles form, so seeding it by everyone's
 * singles rating — which is what the repository used to hand back unconditionally
 * — put the field in the wrong order and printed a number next to each name that
 * had nothing to do with the draw they were in.
 *
 * Falls back to the other rating rather than to null: a player with only a
 * singles rating entering their first doubles category is far better seeded on
 * stale evidence than treated as unrated and dropped to the bottom of the draw.
 */
export function resolveEntrantRating(
  ratings: { singles_rating: number | null; doubles_rating: number | null },
  matchType: TournamentMatchType
): number | null {
  const preferred = matchType === 'doubles' ? ratings.doubles_rating : ratings.singles_rating
  const fallback = matchType === 'doubles' ? ratings.singles_rating : ratings.doubles_rating
  return preferred ?? fallback ?? null
}
