export type TournamentFormat =
  | 'single_elimination'
  | 'double_elimination'
  | 'round_robin'
  | 'pool_play'

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
