import type { SupabaseClient } from '@supabase/supabase-js'
import { createRelationshipRepository } from '../../social/repositories/relationship.repository'
import type {
  PlayerStatsDto,
  RatingHistoryPointDto,
  ClubStatsDto,
  PlayerInsightsDto,
  RatingTrend
} from '../dto/analytics.dto'

export interface AnalyticsService {
  getPlayerStats(playerId: string): Promise<PlayerStatsDto>
  getRatingHistory(playerId: string, ratingType: 'singles' | 'doubles', days?: number): Promise<RatingHistoryPointDto[]>
  getPlayerInsights(playerId: string): Promise<PlayerInsightsDto>
  getClubStats(clubId: string): Promise<ClubStatsDto>
}

export function createAnalyticsService(client: SupabaseClient): AnalyticsService {
  // Follower/following counts go through the social domain's repository rather
  // than a local query. The previous inline filter used follower_id/followed_id,
  // which are not columns on player_relationships (they are from_player_id and
  // to_player_id — see 009-social), so PostgREST errored, the error was
  // swallowed by the Promise.all destructuring, and both counts were always 0.
  const relationships = createRelationshipRepository(client)

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
        followersCount,
        followingCount,
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
        relationships.countFollowers(playerId),
        relationships.countFollowing(playerId),
        client.from('player_achievements').select('achievement_id, achievements(points)').eq('player_id', playerId)
      ])

      // Surface query failures instead of silently reporting zeros — a swallowed
      // error is what hid the broken relationship query for so long.
      for (const [label, result] of [
        ['player_ratings', ratings],
        ['rating_transactions', ratingHistory],
        ['club_memberships', memberships],
        ['tournament_registrations', tournaments],
        ['player_achievements', achievements]
      ] as const) {
        if (result.error) {
          console.error(`[analytics] getPlayerStats: ${label} query failed:`, result.error)
          throw result.error
        }
      }

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
        followers_count: followersCount,
        following_count: followingCount,
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

      // count/head rather than fetching rows and reading .length: PostgREST caps
      // an unbounded select at its default page size, so once ~1000 players sat
      // above someone they all reported the same rank.
      const rankQuery = (ratingType: 'singles' | 'doubles', rating: number | null) =>
        client
          .from('player_ratings')
          .select('id', { count: 'exact', head: true })
          .eq('rating_type', ratingType)
          .not('rating_value', 'is', null)
          .gte('rating_value', rating ?? 999)

      const totalRatedQuery = (ratingType: 'singles' | 'doubles') =>
        client
          .from('player_ratings')
          .select('id', { count: 'exact', head: true })
          .eq('rating_type', ratingType)
          .not('rating_value', 'is', null)

      const [singlesRank, doublesRank, singlesTotal, doublesTotal] = await Promise.all([
        rankQuery('singles', stats.current_singles_rating),
        rankQuery('doubles', stats.current_doubles_rating),
        totalRatedQuery('singles'),
        totalRatedQuery('doubles')
      ])

      const rankSingles = singlesRank.count ?? null
      const rankDoubles = doublesRank.count ?? null

      const percentile = (rank: number | null, total: number | null) =>
        total && rank ? Math.round((1 - rank / total) * 100) : null

      const percentileSingles = percentile(rankSingles, singlesTotal.count ?? null)
      const percentileDoubles = percentile(rankDoubles, doublesTotal.count ?? null)

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
        percentile_doubles: percentileDoubles,
        recent_form: recentForm,
        streak: 0,
        streak_type: null
      }
    },

    async getClubStats(clubId) {
      const thirtyDaysAgo = daysAgo(30)

      const [members, newMembers, events, announcements, tournaments] = await Promise.all([
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
          .gte('created_at', thirtyDaysAgo),
        // tournaments_hosted was hardcoded to 0; tournaments hang off events,
        // so this counts them through the club's own events.
        client.from('tournaments')
          .select('id, events!inner(club_id)')
          .eq('events.club_id', clubId)
      ])

      const memberIds = (members.data ?? []).map(m => m.player_id)

      // Skip the query entirely for a club with no members. It previously sent
      // the literal 'none' into an `in(...)` on a uuid column, which Postgres
      // rejects as a malformed uuid — and the error was discarded, so a brand
      // new club silently reported avg_rating as null for the wrong reason.
      let avgRating: number | null = null
      if (memberIds.length > 0) {
        const { data: ratings, error: ratingsError } = await client
          .from('player_ratings')
          .select('rating_value')
          .in('player_id', memberIds)
          .eq('rating_type', 'singles')
          .not('rating_value', 'is', null)

        if (ratingsError) {
          console.error('[analytics] getClubStats: player_ratings query failed:', ratingsError)
          throw ratingsError
        }
        if (ratings && ratings.length > 0) {
          avgRating = ratings.reduce((sum, r) => sum + (r.rating_value ?? 0), 0) / ratings.length
        }
      }

      // get_club_match_stats has existed in 014-analytics since the schema was
      // written but was never called, so matches_this_month and active_members
      // were hardcoded — every club dashboard showed 0 matches and an
      // active-member count that just mirrored total_members.
      let matchesThisMonth = 0
      let activeMemberCount: number | null = null
      const { data: matchStats, error: matchStatsError } = await client
        .rpc('get_club_match_stats', { p_club_id: clubId })
        .single()

      if (matchStatsError) {
        console.warn('[analytics] get_club_match_stats unavailable:', matchStatsError)
      } else if (matchStats) {
        const s = matchStats as unknown as {
          matches_this_month: number
          active_member_count: number
        }
        matchesThisMonth = Number(s.matches_this_month ?? 0)
        activeMemberCount = Number(s.active_member_count ?? 0)
      }

      const totalMembers = members.data?.length ?? 0
      const newThisMonth = newMembers.data?.length ?? 0
      const priorMembers = totalMembers - newThisMonth

      return {
        club_id: clubId,
        total_members: totalMembers,
        // "Active" means played a verified match recently, which is what the RPC
        // counts. Falls back to total only when the RPC is unavailable.
        active_members: activeMemberCount ?? totalMembers,
        new_members_this_month: newThisMonth,
        matches_this_month: matchesThisMonth,
        tournaments_hosted: tournaments.data?.length ?? 0,
        events_hosted: events.data?.length ?? 0,
        // Growth against the base that existed a month ago. A club that started
        // the month empty has no meaningful rate, so report 0 rather than ∞.
        member_growth_rate:
          priorMembers > 0 ? Math.round((newThisMonth / priorMembers) * 1000) / 10 : 0,
        announcements_this_month: announcements.data?.length ?? 0,
        avg_rating: avgRating ? Math.round(avgRating * 1000) / 1000 : null
      }
    }
  }
}
