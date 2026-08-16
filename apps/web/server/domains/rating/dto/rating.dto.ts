export type RatingType = 'singles' | 'doubles'

export interface PlayerRatingRecord {
  id: string
  player_id: string
  rating_type: RatingType
  rating_value: number | null
  confidence_score: number
  matches_played: number
  provisional: boolean
  calculated_at: string | null
  created_at: string
  updated_at: string
}

export interface RatingTransactionRecord {
  id: string
  player_id: string
  rating_type: RatingType
  match_id: string | null
  old_rating: number | null
  new_rating: number
  rating_delta: number
  confidence_before: number | null
  confidence_after: number
  calculation_version: number
  created_at: string
}

export interface PlayerRatingDto {
  player_id: string
  rating_type: RatingType
  rating_value: number | null
  confidence_score: number
  matches_played: number
  provisional: boolean
  calculated_at: string | null
}

export interface RatingTransactionDto {
  id: string
  player_id: string
  rating_type: RatingType
  match_id: string | null
  old_rating: number | null
  new_rating: number
  rating_delta: number
  calculation_version: number
  created_at: string
}

export function toPlayerRatingDto(record: PlayerRatingRecord): PlayerRatingDto {
  return {
    player_id: record.player_id,
    rating_type: record.rating_type,
    rating_value: record.rating_value,
    confidence_score: record.confidence_score,
    matches_played: record.matches_played,
    provisional: record.provisional,
    calculated_at: record.calculated_at
  }
}

export function toRatingTransactionDto(record: RatingTransactionRecord): RatingTransactionDto {
  return {
    id: record.id,
    player_id: record.player_id,
    rating_type: record.rating_type,
    match_id: record.match_id,
    old_rating: record.old_rating,
    new_rating: record.new_rating,
    rating_delta: record.rating_delta,
    calculation_version: record.calculation_version,
    created_at: record.created_at
  }
}

/** One team's participant in a match, as the rating engine needs to see it. */
export interface RatingMatchParticipant {
  player_id: string
  team_number: 1 | 2
}

/** Everything calculateMatchRatingUpdates needs from a verified match — deliberately not the
 * full MatchDto, so this domain stays decoupled from the Match domain's shape. */
export interface RatedMatchInput {
  match_id: string
  rating_type: RatingType
  participants: RatingMatchParticipant[]
  team1_points: number
  team2_points: number
  played_at: string
}

export interface RatingUpdateResult {
  player_id: string
  old_rating: number
  new_rating: number
  rating_delta: number
  confidence_before: number
  confidence_after: number
  new_matches_played: number
}
