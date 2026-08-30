export type BracketMatchStatus = 'pending' | 'ready' | 'in_progress' | 'completed' | 'bye'

export interface BracketMatchRecord {
  id: string
  tournament_id: string
  round: number
  position: number
  match_id: string | null
  participant1_registration_id: string | null
  participant2_registration_id: string | null
  winner_registration_id: string | null
  status: BracketMatchStatus
  scheduled_at: string | null
  created_at: string
  category_id: string | null
  /**
   * The score of a game in progress. See 043-tournament-live-score for why
   * this is not written into match_scores: an unfinished game is not a
   * result, and a matches row carries verification semantics.
   */
  live_score: LiveBracketScore[] | null
  live_score_updated_at: string | null
  /** Non-null once the match is actually being played. */
  started_at: string | null
}

/**
 * A bracket row as the generators emit it and the repository inserts it.
 *
 * The live-score columns are omitted alongside id/created_at: a freshly drawn
 * match has never been played, so the database defaults (NULL) are the correct
 * values, and requiring them would make every generator spell out three nulls
 * on every literal it builds.
 */
export type NewBracketMatch = Omit<
  BracketMatchRecord,
  'id' | 'created_at' | 'live_score' | 'live_score_updated_at' | 'started_at'
>

/** One game of a bracket match while it is still being played. */
export interface LiveBracketScore {
  game_number: number
  team1_score: number
  team2_score: number
}

/**
 * A bracket slot with the entrant resolved.
 *
 * The bracket stores registration ids and nothing else, which is right for the
 * data but useless on screen — BracketMatchCard was rendering
 * `registration_id.slice(0, 8)`. This is the display half, hydrated in
 * `getBracket` from the registration rows; the ids stay on the DTO alongside
 * it so nothing that already reads them has to change.
 */
export interface BracketParticipantDto {
  registration_id: string
  display_name: string
  rating: number | null
  /** Doubles only; null for a singles entrant. */
  partner_display_name: string | null
}

/**
 * One set of a played match, oriented to the BRACKET's slots.
 *
 * `match_scores` stores team1/team2, where "team 1" is whoever holds
 * `match_participants.team_number = 1`. That ordering is established when the
 * match is submitted and has nothing to do with which bracket slot an entrant
 * occupies, so the two can disagree. Re-orienting once here means every reader
 * can line these numbers up with participant1/participant2 without knowing the
 * match domain exists.
 */
export interface BracketMatchScoreDto {
  set_number: number
  participant1_score: number
  participant2_score: number
}

export interface BracketMatchDto {
  id: string
  tournament_id: string
  round: number
  position: number
  match_id: string | null
  participant1_registration_id: string | null
  participant2_registration_id: string | null
  winner_registration_id: string | null
  status: BracketMatchStatus
  scheduled_at: string | null
  category_id: string | null
  /** Null for an empty slot (a bye, or a match whose feeder has not finished). */
  participant1: BracketParticipantDto | null
  participant2: BracketParticipantDto | null
  /**
   * Empty when the slot has no linked match, when no sets were recorded, or
   * when the slots could not be mapped onto the match's teams. A reversed score
   * reads as perfectly plausible and would be believed, so an unresolvable
   * orientation yields nothing rather than a guess.
   */
  scores: BracketMatchScoreDto[]
  /** In-progress score, when this match is being played right now. */
  live_score: LiveBracketScore[] | null
  started_at: string | null
  /** Started, and no winner yet. What drives the red LIVE label. */
  is_live: boolean
}

export function toBracketMatchDto(
  record: BracketMatchRecord,
  participants?: ReadonlyMap<string, BracketParticipantDto>,
  scores?: ReadonlyMap<string, BracketMatchScoreDto[]>
): BracketMatchDto {
  const resolve = (registrationId: string | null) =>
    (registrationId && participants?.get(registrationId)) || null

  return {
    id: record.id,
    tournament_id: record.tournament_id,
    round: record.round,
    position: record.position,
    match_id: record.match_id,
    participant1_registration_id: record.participant1_registration_id,
    participant2_registration_id: record.participant2_registration_id,
    winner_registration_id: record.winner_registration_id,
    status: record.status,
    scheduled_at: record.scheduled_at,
    category_id: record.category_id,
    participant1: resolve(record.participant1_registration_id),
    participant2: resolve(record.participant2_registration_id),
    scores: scores?.get(record.id) ?? [],
    live_score: record.live_score ?? null,
    started_at: record.started_at ?? null,
    // Started and undecided. A finished match keeps its started_at, so the
    // winner check is what stops it claiming to be live forever.
    is_live: !!record.started_at && !record.winner_registration_id
  }
}

export interface BracketDto {
  tournament_id: string
  category_id: string | null
  /**
   * Whether the organiser has frozen this draw.
   *
   * A locked draw is final: visible to players, playable, and no longer
   * redrawable. An unlocked one is the organiser's working copy, and comes back
   * with `rounds: []` to anybody else — so a caller cannot distinguish "not
   * drawn yet" from "not published yet" by the rounds alone, and needs this.
   */
  locked: boolean
  rounds: BracketRoundDto[]
}

export interface BracketRoundDto {
  round: number
  matches: BracketMatchDto[]
}

/**
 * An organiser writing down what happened on court.
 *
 * Scores are given the way the organiser sees them on the draw — participant1's
 * column first — not the way `match_scores` stores them. The service owns the
 * translation, and because it also creates the match it can simply define
 * participant1 as team 1, which is what keeps a recorded result readable back
 * in the same orientation it was entered.
 */
export interface RecordBracketResultInput {
  winner_registration_id: string
  scores: {
    set_number: number
    participant1_score: number
    participant2_score: number
  }[]
}

export interface UpdateBracketMatchInput {
  match_id?: string | null
  winner_registration_id?: string | null
  status?: BracketMatchStatus
  scheduled_at?: string | null
}
