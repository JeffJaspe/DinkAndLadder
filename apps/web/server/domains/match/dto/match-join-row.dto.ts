/**
 * Shape of the nested `matches` join used by the match-listing endpoints
 * (players/me, clubs/:id, events/:id). PostgREST embeds are not covered by the
 * generated Database types while `types/database.types.ts` is absent, so these
 * endpoints previously typed every row and callback as `any`.
 *
 * Declared once and shared rather than re-typed per endpoint: the three selects
 * differ only in which top-level columns they ask for, so the extras are
 * optional here.
 */
export interface MatchParticipantJoinRow {
  player_id: string
  team_number: number
  result_status?: string | null
  player_profiles?: { id?: string; display_name?: string | null } | null
}

export interface MatchScoreJoinRow {
  set_number: number
  team1_score: number
  team2_score: number
}

export interface MatchJoinRow {
  id: string
  match_type: string
  status: string
  event_id?: string | null
  affects_rating?: boolean | null
  venue?: string | null
  played_at: string
  submitted_at?: string | null
  verified_at?: string | null
  match_participants?: MatchParticipantJoinRow[] | null
  match_scores?: MatchScoreJoinRow[] | null
}

/**
 * Response shape the match-listing endpoints return, after MatchJoinRow is
 * flattened. Shared so the pages consuming it are typed rather than `any[]`.
 */
export interface MatchListParticipantDto {
  player_id: string
  team_number: number
  result_status?: string | null
  display_name?: string | null
}

export interface MatchListItemDto {
  id: string
  match_type: string
  status: string
  event_id?: string | null
  affects_rating?: boolean | null
  venue?: string | null
  played_at: string
  submitted_at?: string | null
  verified_at?: string | null
  participants: MatchListParticipantDto[]
  scores: { set_number: number; team1_score: number; team2_score: number }[]
}
