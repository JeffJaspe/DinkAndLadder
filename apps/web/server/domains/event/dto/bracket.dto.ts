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
}

export function toBracketMatchDto(record: BracketMatchRecord): BracketMatchDto {
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
    category_id: record.category_id
  }
}

export interface BracketDto {
  tournament_id: string
  category_id: string | null
  rounds: BracketRoundDto[]
}

export interface BracketRoundDto {
  round: number
  matches: BracketMatchDto[]
}

export interface UpdateBracketMatchInput {
  match_id?: string | null
  winner_registration_id?: string | null
  status?: BracketMatchStatus
  scheduled_at?: string | null
}
