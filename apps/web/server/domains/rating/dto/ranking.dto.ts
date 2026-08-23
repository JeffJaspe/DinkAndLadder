import type { RatingType } from './rating.dto'

export interface RankingQuery {
  rating_type: RatingType
  province?: string
  city?: string
  barangay?: string
  /**
   * Case-insensitive substring match on display_name. Applied in SQL so the
   * search covers the whole ladder — filtering in the browser only ever saw the
   * loaded page, so searching for someone ranked 200th silently found nothing.
   */
  q?: string
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

/**
 * One ranked player.
 *
 * `trend_delta` is the sum of the player's rating changes over the trend
 * window (see RANKING_TREND_DAYS). It is null when the player has had no rated
 * match in that window — which is different from a delta of zero, and the UI
 * must render the two differently. The rankings table previously filled this
 * column with `Math.floor(Math.random() * 20)`, re-rolled on every render.
 */
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
  trend_delta: number | null
}

/** A page of rankings plus what the caller needs to build real pagination. */
export interface RankingPageDto {
  data: RankingEntryDto[]
  total: number
  limit: number
  offset: number
}

export function toRankingEntryDto(
  row: RankingRow,
  rank: number,
  ratingType: RatingType,
  trendDelta: number | null = null
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
    barangay: row.barangay,
    trend_delta: trendDelta
  }
}
