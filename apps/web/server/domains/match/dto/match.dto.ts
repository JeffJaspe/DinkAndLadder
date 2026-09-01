import type { MatchResultType, SubmittedByRole } from '~/utils/game-rules'

export type MatchType = 'singles' | 'doubles'
export type MatchStatus =
  | 'draft'
  | 'submitted'
  | 'pending_agreement'
  | 'pending_verification'
  | 'verified'
  | 'rejected'
  | 'disputed'
export type ParticipantResultStatus = 'pending' | 'won' | 'lost'
export type TeamNumber = 1 | 2
export type VerificationStatus = 'pending' | 'confirmed' | 'rejected' | 'disputed'
export type ScoreProposalStatus = 'pending' | 'accepted' | 'countered' | 'expired'

export interface MatchParticipantRecord {
  id: string
  match_id: string
  player_id: string
  team_number: TeamNumber
  result_status: ParticipantResultStatus
}

export interface MatchScoreRecord {
  id: string
  match_id: string
  set_number: number
  team1_score: number
  team2_score: number
}

export interface MatchVerificationRecord {
  id: string
  match_id: string
  verifier_player_id: string
  status: VerificationStatus
  response_note: string | null
  responded_at: string | null
  created_at: string
}

export interface MatchScoreProposalRecord {
  id: string
  match_id: string
  proposed_by_player_id: string
  scores: Array<{ set_number: number; team1_score: number; team2_score: number }>
  status: ScoreProposalStatus
  proposal_round: number
  created_at: string
}

export interface MatchRecord {
  id: string
  match_type: MatchType
  status: MatchStatus
  /** How the match ended — see 047. Anything but normal names a winner without a full score. */
  result_type: MatchResultType
  /** Which of the three parties entered the score. Null on rows predating 047. */
  submitted_by_role: SubmittedByRole | null
  submitted_by_player_id: string
  event_id: string | null
  affects_rating: boolean
  venue: string | null
  played_at: string
  submitted_at: string
  verified_at: string | null
  created_at: string
  match_participants: MatchParticipantRecord[]
  match_scores: MatchScoreRecord[]
  match_verifications: MatchVerificationRecord[]
  match_score_proposals: MatchScoreProposalRecord[]
}

export interface MatchDto {
  id: string
  match_type: MatchType
  status: MatchStatus
  result_type: MatchResultType
  submitted_by_role: SubmittedByRole | null
  submitted_by_player_id: string
  event_id: string | null
  affects_rating: boolean
  venue: string | null
  played_at: string
  submitted_at: string
  verified_at: string | null
  created_at: string
  participants: Array<{
    player_id: string
    team_number: TeamNumber
    result_status: ParticipantResultStatus
  }>
  scores: Array<{ set_number: number; team1_score: number; team2_score: number }>
  verifications: Array<{
    verifier_player_id: string
    status: VerificationStatus
    response_note: string | null
    responded_at: string | null
  }>
  score_proposals: Array<{
    id: string
    proposed_by_player_id: string
    scores: Array<{ set_number: number; team1_score: number; team2_score: number }>
    status: ScoreProposalStatus
    proposal_round: number
    created_at: string
  }>
}

export interface RecordVerificationDecisionInput {
  status: Extract<VerificationStatus, 'confirmed' | 'rejected' | 'disputed'>
  response_note?: string | null
}

export interface SubmitMatchParticipantInput {
  player_id: string
  team_number: TeamNumber
}

export interface SubmitMatchScoreInput {
  set_number: number
  team1_score: number
  team2_score: number
}

export interface SubmitMatchInput {
  /** Defaults to normal. Only an abandoned match needs anything else. */
  result_type?: MatchResultType
  /**
   * Winner when the score cannot name one — a walkover with no game played.
   * Ignored for a normal result, where the score is the only authority.
   */
  winner_team?: 1 | 2 | null
  event_id: string
  match_type: MatchType
  venue?: string | null
  played_at: string
  participants: SubmitMatchParticipantInput[]
  scores: SubmitMatchScoreInput[]
}

export interface CounterScoreInput {
  scores: SubmitMatchScoreInput[]
}

export function toMatchDto(match: MatchRecord): MatchDto {
  return {
    // Defaulted for rows created before 047: every one of them was played
    // out normally and submitted by a participant.
    id: match.id,
    match_type: match.match_type,
    status: match.status,
    result_type: match.result_type ?? 'normal',
    submitted_by_role: match.submitted_by_role ?? null,
    submitted_by_player_id: match.submitted_by_player_id,
    event_id: match.event_id,
    affects_rating: match.affects_rating,
    venue: match.venue,
    played_at: match.played_at,
    submitted_at: match.submitted_at,
    verified_at: match.verified_at,
    created_at: match.created_at,
    participants: match.match_participants.map((p) => ({
      player_id: p.player_id,
      team_number: p.team_number,
      result_status: p.result_status
    })),
    scores: match.match_scores.map((s) => ({
      set_number: s.set_number,
      team1_score: s.team1_score,
      team2_score: s.team2_score
    })),
    verifications: match.match_verifications.map((v) => ({
      verifier_player_id: v.verifier_player_id,
      status: v.status,
      response_note: v.response_note,
      responded_at: v.responded_at
    })),
    score_proposals: match.match_score_proposals.map((p) => ({
      id: p.id,
      proposed_by_player_id: p.proposed_by_player_id,
      scores: p.scores,
      status: p.status,
      proposal_round: p.proposal_round,
      created_at: p.created_at
    }))
  }
}

/**
 * The slice of a match another domain needs to render a score next to names it
 * already has: who played on which team, and what each set finished.
 *
 * Deliberately narrower than MatchRecord. The bracket only needs to orient two
 * columns of numbers against two entrants; handing it the verifications and
 * score proposals as well would leak the whole match workflow into the event
 * domain for no gain.
 */
export interface MatchScoreLookupRow {
  match_id: string
  participants: { player_id: string; team_number: TeamNumber }[]
  scores: { set_number: number; team1_score: number; team2_score: number }[]
}
