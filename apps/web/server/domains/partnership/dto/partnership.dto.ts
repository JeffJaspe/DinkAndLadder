export type PartnerRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

export interface PartnershipRecord {
  id: string
  player1_id: string
  player2_id: string
  created_at: string
}

/**
 * A player's chosen duo. One row per player — `player_id` is the primary key,
 * so changing your duo is an upsert rather than a delete-then-insert.
 */
export interface DefaultPartnerRecord {
  player_id: string
  partner_id: string
  updated_at: string
}

export interface PartnerRequestRecord {
  id: string
  from_player_id: string
  to_player_id: string
  status: PartnerRequestStatus
  message: string | null
  responded_at: string | null
  created_at: string
}

export interface PartnerDto {
  player_id: string
  display_name: string
  province: string | null
  city: string | null
  singles_rating: number | null
  doubles_rating: number | null
  partnered_since: string
  /** True for the one partner the player has marked as their default duo. */
  is_default: boolean
}

export interface PartnerRequestDto {
  id: string
  from_player_id: string
  to_player_id: string
  status: PartnerRequestStatus
  message: string | null
  created_at: string
  player?: {
    id: string
    display_name: string
    rating?: number | null
  }
}

export function toPartnerRequestDto(record: PartnerRequestRecord): PartnerRequestDto {
  return {
    id: record.id,
    from_player_id: record.from_player_id,
    to_player_id: record.to_player_id,
    status: record.status,
    message: record.message,
    created_at: record.created_at
  }
}
