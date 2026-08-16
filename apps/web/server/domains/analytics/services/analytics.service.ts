import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PlayerStatsDto,
  RatingHistoryPointDto,
  ClubStatsDto,
  PlatformStatsDto,
  PlayerInsightsDto,
  RatingTrend
} from '../dto/analytics.dto'

export interface AnalyticsService {
  getPlayerStats(playerId: string): Promise<PlayerStatsDto>
  getRatingHistory(playerId: string, ratingType: 'singles' | 'doubles', days?: number): Promise<RatingHistoryPointDto[]>
  getPlayerInsights(playerId: string): Promise<PlayerInsightsDto>
  getClubStats(clubId: string): Promise<ClubStatsDto>
  getPlatformStats(): Promise<PlatformStatsDto>
}

export function createAnalyticsService(client: SupabaseClient): AnalyticsService {
  const now = () => new Date().toISOString()
  const daysAgo = (d: number) => {
    const date = new Date()
    date.setDate(date.getDate() - d)
    return date.toISOString()
  }

  return {
    async getPlayerStats(playerId) {
      const [
        matchStats,
        ratings,
        ratingHistory,
        memberships,
        tournaments,
        social,
        achievements
      ] = await Promise.all([
        client.rpc('get_player_match_stats', { p_player_id: playerId }).single(),
        client.from('player_ratings').select('rating_type, rating_value').eq('player_id', playerId),
        client.from('rating_transactions')
          .select('new_rating, rating_type, created_at')
          .eq('player_id', playerId)
          .order('created_at', { ascending: false })
          .limit(10),
        client.from('club_memberships').select('id').eq('player_id', playerId).eq('status', 'active'),
        client.from('tournament_registrations').select('id').eq('player_id', playerId),
        client.from('player_relationships').select('id, relationship_type').or(`follower_id.eq.${playerId},followed_id.eq.${playerId}`),
        client.from('player_achievements').select('achievement_id, achievements(points)').eq('player_id', playerId)
      ])

      const singlesRating = ratings.data?.find(r => r.rating_type === 'singles')?.rating_value ?? null
      const doublesRating = ratings.data?.find(r => r.rating_type === 'doubles')?.rating_value ?? null

      const recentRatings = ratingHistory.data ?? []
      let trend: RatingTrend = 'stable'
      if (recentRatings.length >= 3) {
        const latest = recentRatings[0]?.new_rating ?? 0
        const earlier = recentRatings[2]?.new_rating ?? 0
        if (latest > earlier + 0.05) trend = 'rising'
        else if (latest < earlier - 0.05) trend = 'falling'
      }

      const followers = (social.data ?? []).filter(r => r.relationship_type === 'follow').length
      const achievementRows = achievements.data ?? []
      const totalPoints = achievementRows.reduce((sum, a) => {
        const pts = (a as unknown as { achievements: { points: number } | null }).achievements?.points ?? 0
        return sum + pts
      }, 0)

      const stats = matchStats.data as unknown as {
        total_matches: number
        singles_matches: number
        doubles_matches: number
        wins: number
        losses: number
        matches_this_month: number
      } | null

      return {
        player_id: playerId,
        total_matches: stats?.total_matches ?? 0,
        singles_matches: stats?.singles_matches ?? 0,
        doubles_matches: stats?.doubles_matches ?? 0,
        wins: stats?.wins ?? 0,
        losses: stats?.losses ?? 0,
        win_rate: stats?.total_matches ? Math.round((stats.wins / stats.total_matches) * 100) : 0,
        current_singles_rating: singlesRating,
        current_doubles_rating: doublesRating,
        highest_singles_rating: singlesRating,
        highest_doubles_rating: doublesRating,
        rating_trend: trend,
        matches_this_month: stats?.matches_this_month ?? 0,
        clubs_count: memberships.data?.length ?? 0,
        tournaments_participated: tournaments.data?.length ?? 0,
        followers_count: followers,
        following_count: (social.data ?? []).length - followers,
        achievements_count: achievementRows.length,
        achievement_points: totalPoints
      }
    },

    async getRatingHistory(playerId, ratingType, days = 90) {
      const since = daysAgo(days)

      const { data, error } = await client
        .from('rating_transactions')
        .select('new_rating, rating_type, match_id, created_at')
        .eq('player_id', playerId)
        .eq('rating_type', ratingType)
        .gte('created_at', since)
        .order('created_at', { ascending: true })

      if (error) throw error

      return (data ?? []).map(row => ({
        date: row.created_at,
        rating_value: row.new_rating,
        rating_type: row.rating_type as 'singles' | 'doubles',
        match_id: row.match_id
      }))
    },

    async getPlayerInsights(playerId) {
      const stats = await this.getPlayerStats(playerId)

      const { data: singlesRank } = await client
        .from('player_ratings')
        .select('id')
        .eq('rating_type', 'singles')
        .not('rating_value', 'is', null)
        .gte('rating_value', stats.current_singles_rating ?? 999)

      const { data: doublesRank } = await client
        .from('player_ratings')
        .select('id')
        .eq('rating_type', 'doubles')
        .not('rating_value', 'is', null)
        .gte('rating_value', stats.current_doubles_rating ?? 999)

      const { count: totalRated } = await client
        .from('player_ratings')
        .select('id', { count: 'exact', head: true })
        .eq('rating_type', 'singles')
        .not('rating_value', 'is', null)

      const rankSingles = singlesRank?.length ?? null
      const rankDoubles = doublesRank?.length ?? null
      const percentileSingles = totalRated && rankSingles
        ? Math.round((1 - rankSingles / totalRated) * 100)
        : null

      const recentWins = stats.wins
      const recentLosses = stats.losses
      let recentForm: 'hot' | 'cold' | 'neutral' = 'neutral'
      if (stats.matches_this_month >= 3) {
        const recentWinRate = recentWins / (recentWins + recentLosses)
        if (recentWinRate >= 0.7) recentForm = 'hot'
        else if (recentWinRate <= 0.3) recentForm = 'cold'
      }

      return {
        stats,
        rank_singles: rankSingles,
        rank_doubles: rankDoubles,
        percentile_singles: percentileSingles,
        percentile_doubles: null,
        recent_form: recentForm,
        streak: 0,
        streak_type: null
      }
    },

    async getClubStats(clubId) {
      const thirtyDaysAgo = daysAgo(30)

      const [members, newMembers, events, announcements] = await Promise.all([
        client.from('club_memberships')
          .select('id, player_id, joined_at')
          .eq('club_id', clubId)
          .eq('status', 'active'),
        client.from('club_memberships')
          .select('id')
          .eq('club_id', clubId)
          .eq('status', 'active')
          .gte('joined_at', thirtyDaysAgo),
        client.from('events')
          .select('id')
          .eq('club_id', clubId),
        client.from('club_announcements')
          .select('id')
          .eq('club_id', clubId)
          .gte('created_at', thirtyDaysAgo)
      ])

      const memberIds = (members.data ?? []).map(m => m.player_id)

      const { data: ratings } = await client
        .from('player_ratings')
        .select('rating_value')
        .in('player_id', memberIds.length > 0 ? memberIds : ['none'])
        .eq('rating_type', 'singles')
        .not('rating_value', 'is', null)

      const avgRating = ratings && ratings.length > 0
        ? ratings.reduce((sum, r) => sum + (r.rating_value ?? 0), 0) / ratings.length
        : null

      return {
        club_id: clubId,
        total_members: members.data?.length ?? 0,
        active_members: members.data?.length ?? 0,
        new_members_this_month: newMembers.data?.length ?? 0,
        matches_this_month: 0,
        tournaments_hosted: 0,
        events_hosted: events.data?.length ?? 0,
        member_growth_rate: 0,
        announcements_this_month: announcements.data?.length ?? 0,
        avg_rating: avgRating ? Math.round(avgRating * 1000) / 1000 : null
      }
    },

    async getPlatformStats() {
      const sevenDaysAgo = daysAgo(7)
      const thirtyDaysAgo = daysAgo(30)

      const [players, clubs, matches, recentMatches] = await Promise.all([
        client.from('player_profiles').select('id', { count: 'exact', head: true }),
        client.from('clubs').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        client.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
        client.from('matches')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'verified')
          .gte('created_at', sevenDaysAgo)
      ])

      return {
        total_players: players.count ?? 0,
        total_clubs: clubs.count ?? 0,
        total_matches: matches.count ?? 0,
        matches_this_week: recentMatches.count ?? 0,
        active_players_this_month: 0
      }
    }
  }
}
