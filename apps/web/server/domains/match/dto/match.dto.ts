export type MatchType = 'singles' | 'doubles'
export type MatchStatus =
  'draft' | 'submitted' | 'pending_verification' | 'verified' | 'rejected' | 'disputed'
export type ParticipantResultStatus = 'pending' | 'won' | 'lost'
export type TeamNumber = 1 | 2
export type VerificationStatus = 'pending' | 'confirmed' | 'rejected' | 'disputed'

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

export interface MatchRecord {
  id: string
  match_type: MatchType
  status: MatchStatus
  submitted_by_player_id: string
  venue: string | null
  played_at: string
  submitted_at: string
  verified_at: string | null
  created_at: string
  match_participants: MatchParticipantRecord[]
  match_scores: MatchScoreRecord[]
  match_verifications: MatchVerificationRecord[]
}

export interface MatchDto {
  id: string
  match_type: MatchType
  status: MatchStatus
  submitted_by_player_id: string
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
  match_type: MatchType
  venue?: string | null
  played_at: string
  participants: SubmitMatchParticipantInput[]
  scores: SubmitMatchScoreInput[]
}

export function toMatchDto(match: MatchRecord): MatchDto {
  return {
    id: match.id,
    match_type: match.match_type,
    status: match.status,
    submitted_by_player_id: match.submitted_by_player_id,
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
    }))
  }
}
