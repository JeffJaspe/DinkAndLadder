export type TeamUpStatus = 'pending' | 'accepted' | 'declined'

/**
 * A roster entry: someone the owner may register for an open play session.
 *
 * Directional on purpose, unlike a partnership. "I may bring you" does not mean
 * "you may bring me" — see the note in Liquibase 035 for why folding the two
 * concepts together breaks one or the other.
 */
export interface TeamUpRecord {
  id: string
  owner_player_id: string
  member_player_id: string
  status: TeamUpStatus
  message: string | null
  responded_at: string | null
  created_at: string
}

/** A roster entry with the other person resolved, for a list on screen. */
export interface TeamMemberDto {
  id: string
  player_id: string
  display_name: string
  province: string | null
  city: string | null
  singles_rating: number | null
  doubles_rating: number | null
  status: TeamUpStatus
  created_at: string
}

export interface TeamUpRequestDto {
  id: string
  owner_player_id: string
  member_player_id: string
  status: TeamUpStatus
  message: string | null
  created_at: string
  player?: {
    id: string
    display_name: string
    rating?: number | null
  }
}

export function toTeamUpRequestDto(record: TeamUpRecord): TeamUpRequestDto {
  return {
    id: record.id,
    owner_player_id: record.owner_player_id,
    member_player_id: record.member_player_id,
    status: record.status,
    message: record.message,
    created_at: record.created_at
  }
}
