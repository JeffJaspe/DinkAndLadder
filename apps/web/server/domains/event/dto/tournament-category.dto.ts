import type { TournamentFormat, TournamentMatchType } from './tournament.dto'

export type TournamentCategoryType = 'predefined' | 'custom'
export type TournamentCategoryStatus = 'open' | 'closed' | 'completed'

export interface TournamentCategoryRecord {
  id: string
  tournament_id: string
  template_id: string | null
  name: string
  category_type: TournamentCategoryType
  min_rating: number | null
  max_rating: number | null
  max_participants: number | null
  display_order: number
  status: TournamentCategoryStatus
  /** Null means "inherit from the tournament" — see resolveMatchType. */
  match_type: TournamentMatchType | null
  /** Null means "inherit from the tournament" — see resolveFormat. */
  format: TournamentFormat | null
  /** Null while the draw is still being worked on — see resolveBracketLock. */
  bracket_locked_at: string | null
  bracket_locked_by_player_id: string | null
  /**
   * Game rules for this category — see 046 and utils/game-rules.ts.
   *
   * Read through rulesForRound(), never directly: round_game_rules holds only
   * the rounds that differ from games_default, so a raw lookup misses the
   * fallback and quietly scores a final as best-of-1.
   */
  games_default: number
  round_game_rules: Record<string, number> | null
  target_points: number
  win_by_two: boolean
  created_at: string
  updated_at: string
}

export interface TournamentCategoryDto {
  id: string
  tournament_id: string
  template_id: string | null
  name: string
  category_type: TournamentCategoryType
  min_rating: number | null
  max_rating: number | null
  max_participants: number | null
  display_order: number
  status: TournamentCategoryStatus
  match_type: TournamentMatchType | null
  format: TournamentFormat | null
  /**
   * When the organiser froze the draw. Non-null means the bracket is final: it
   * is visible to players, results can be recorded against it, and it can no
   * longer be regenerated or undone.
   */
  bracket_locked_at: string | null
  /** Game rules — see 046. Read via rulesForRound(), never field by field. */
  games_default: number
  round_game_rules: Record<string, number> | null
  target_points: number
  win_by_two: boolean
}

export function toTournamentCategoryDto(record: TournamentCategoryRecord): TournamentCategoryDto {
  return {
    id: record.id,
    tournament_id: record.tournament_id,
    template_id: record.template_id,
    name: record.name,
    category_type: record.category_type,
    min_rating: record.min_rating,
    max_rating: record.max_rating,
    max_participants: record.max_participants,
    display_order: record.display_order,
    status: record.status,
    match_type: record.match_type,
    format: record.format,
    bracket_locked_at: record.bracket_locked_at,
    // Defaulted the same way match_format is on events: every category created
    // before 046 was played to a single game of 11, win by 2, because nothing
    // could express anything else.
    games_default: record.games_default ?? 1,
    round_game_rules: record.round_game_rules ?? null,
    target_points: record.target_points ?? 11,
    win_by_two: record.win_by_two ?? true
  }
}

/**
 * Whether this category's draw is frozen, and by whom.
 *
 * Same two-table contract as resolveMatchType and resolveFormat, for the same
 * reason: a tournament may run one flat draw with no category at all, and that
 * draw still needs somewhere to record its lock. A category that states its own
 * lock wins; otherwise the tournament's applies.
 *
 * Locking is the hinge of the whole bracket lifecycle — it is what makes a draw
 * visible to players and results recordable — so every caller that needs to
 * know goes through here rather than reading a column, exactly so the generator,
 * the visibility gate and the result recorder cannot disagree.
 */
export function resolveBracketLock(
  category: { bracket_locked_at: string | null } | null,
  tournamentLockedAt: string | null
): string | null {
  return category?.bracket_locked_at ?? tournamentLockedAt
}

/**
 * Whether this category is played in singles or doubles.
 *
 * A category may state its own; a null means it predates per-category types, or
 * was created by a client that does not send one, and falls back to the
 * tournament's. Every caller that needs to know — the partner rule on
 * registration, the match created when a result is recorded, and the label on
 * the card — goes through here so they cannot disagree.
 */
export function resolveMatchType(
  category: { match_type: TournamentMatchType | null } | null,
  tournamentMatchType: TournamentMatchType
): TournamentMatchType {
  return category?.match_type ?? tournamentMatchType
}

/**
 * How this category is drawn.
 *
 * Same contract as resolveMatchType, for the same reason: a category may state
 * its own format, and a null means it predates per-category formats or was
 * created by a client that does not send one. The bracket generator, the draw
 * view and the settings form all go through here so they cannot disagree about
 * which format a category is being played in — which they would the moment an
 * organiser changed the tournament's own format after a category was created.
 */
export function resolveFormat(
  category: { format: TournamentFormat | null } | null,
  tournamentFormat: TournamentFormat
): TournamentFormat {
  return category?.format ?? tournamentFormat
}

export interface CreateTournamentCategoryInput {
  tournament_id: string
  template_id?: string | null
  name: string
  category_type: TournamentCategoryType
  min_rating?: number | null
  max_rating?: number | null
  max_participants?: number | null
  display_order?: number
  match_type?: TournamentMatchType | null
  format?: TournamentFormat | null
}

export interface TournamentCategoryTemplateRecord {
  id: string
  name: string
  min_rating: number | null
  max_rating: number | null
  display_order: number
}

export interface TournamentCategoryTemplateDto {
  id: string
  name: string
  min_rating: number | null
  max_rating: number | null
  display_order: number
}

export function toTournamentCategoryTemplateDto(
  record: TournamentCategoryTemplateRecord
): TournamentCategoryTemplateDto {
  return {
    id: record.id,
    name: record.name,
    min_rating: record.min_rating,
    max_rating: record.max_rating,
    display_order: record.display_order
  }
}

/**
 * Fields an organiser may change on an existing category. Deliberately narrower
 * than CreateTournamentCategoryInput: tournament_id, template_id and
 * category_type identify the row's origin and must not be rewritten.
 */
export interface UpdateTournamentCategoryInput {
  name?: string
  min_rating?: number | null
  max_rating?: number | null
  max_participants?: number | null
  display_order?: number
  status?: TournamentCategoryStatus
  match_type?: TournamentMatchType | null
  format?: TournamentFormat | null
}
