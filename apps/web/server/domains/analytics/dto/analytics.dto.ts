export type RatingTrend = 'rising' | 'falling' | 'stable'

export interface PlayerStatsDto {
  player_id: string
  total_matches: number
  singles_matches: number
  doubles_matches: number
  wins: number
  losses: number
  win_rate: number
  current_singles_rating: number | null
  current_doubles_rating: number | null
  highest_singles_rating: number | null
  highest_doubles_rating: number | null
  rating_trend: RatingTrend
  matches_this_month: number
  clubs_count: number
  tournaments_participated: number
  followers_count: number
  following_count: number
  achievements_count: number
  achievement_points: number
}

export interface RatingHistoryPointDto {
  date: string
  rating_value: number
  rating_type: 'singles' | 'doubles'
  match_id: string | null
}

export interface ClubStatsDto {
  club_id: string
  total_members: number
  active_members: number
  new_members_this_month: number
  matches_this_month: number
  tournaments_hosted: number
  events_hosted: number
  member_growth_rate: number
  announcements_this_month: number
  avg_rating: number | null
}

export interface PlatformStatsDto {
  total_players: number
  total_clubs: number
  total_matches: number
  matches_this_week: number
  active_players_this_month: number
}

export interface PlayerInsightsDto {
  stats: PlayerStatsDto
  rank_singles: number | null
  rank_doubles: number | null
  percentile_singles: number | null
  percentile_doubles: number | null
  recent_form: 'hot' | 'cold' | 'neutral'
  streak: number
  streak_type: 'win' | 'loss' | null
}
