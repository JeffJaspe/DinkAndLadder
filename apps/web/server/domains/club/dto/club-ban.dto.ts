/**
 * A player banned from a club's events.
 */
export interface ClubBannedPlayerRecord {
  id: string
  club_id: string
  player_id: string
  banned_by: string
  reason: string | null
  banned_at: string
}

export interface ClubBannedPlayerDto {
  id: string
  club_id: string
  player_id: string
  player_name: string
  banned_by: string
  banned_by_name: string
  reason: string | null
  banned_at: string
}
