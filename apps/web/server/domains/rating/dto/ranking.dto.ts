import type { RatingType } from './rating.dto'

export interface RankingQuery {
  rating_type: RatingType
  province?: string
  city?: string
  barangay?: string
  limit: number
  offset: number
}

/** One row from the player_ratings/player_profiles join, before rank numbers are assigned. */
export interface RankingRow {
  player_id: string
  display_name: string
  rating_value: number
  confidence_score: number
  matches_played: number
  provisional: boolean
  province: string | null
  city: string | null
  barangay: string | null
}

export interface RankingEntryDto {
  rank: number
  player_id: string
  display_name: string
  rating_type: RatingType
  rating_value: number
  confidence_score: number
  matches_played: number
  provisional: boolean
  province: string | null
  city: string | null
  barangay: string | null
}

export function toRankingEntryDto(
  row: RankingRow,
  rank: number,
  ratingType: RatingType
): RankingEntryDto {
  return {
    rank,
    player_id: row.player_id,
    display_name: row.display_name,
    rating_type: ratingType,
    rating_value: row.rating_value,
    confidence_score: row.confidence_score,
    matches_played: row.matches_played,
    provisional: row.provisional,
    province: row.province,
    city: row.city,
    barangay: row.barangay
  }
}
