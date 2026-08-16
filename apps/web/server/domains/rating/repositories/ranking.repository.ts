import type { SupabaseClient } from '@supabase/supabase-js'
import type { RankingQuery, RankingRow } from '../dto/ranking.dto'

interface RankingJoinRow {
  player_id: string
  rating_value: number | null
  confidence_score: number
  matches_played: number
  provisional: boolean
  player_profiles: {
    display_name: string
    province: string | null
    city: string | null
  } | null
}

export interface RankingRepository {
  /** Ordered by rating_value descending. Only non-null ratings for players whose profile is
   * public are returned — see the Player domain's `player_profiles_select_public` RLS policy
   * and this query's own `!inner` join, which is what actually enforces the visibility filter
   * (RLS alone would just silently drop non-visible rows from the embed, not filter on it). */
  getRankings(query: RankingQuery): Promise<RankingRow[]>
}

export function createRankingRepository(client: SupabaseClient): RankingRepository {
  return {
    async getRankings(query) {
      let builder = client
        .from('player_ratings')
        .select(
          'player_id, rating_value, confidence_score, matches_played, provisional, player_profiles!inner(display_name, province, city)'
        )
        .eq('rating_type', query.rating_type)
        .not('rating_value', 'is', null)
        .eq('player_profiles.profile_visibility', 'public')

      if (query.province) {
        builder = builder.eq('player_profiles.province', query.province)
      }
      if (query.city) {
        builder = builder.eq('player_profiles.city', query.city)
      }

      const { data, error } = await builder
        .order('rating_value', { ascending: false })
        .range(query.offset, query.offset + query.limit - 1)

      if (error) throw error

      return ((data ?? []) as unknown as RankingJoinRow[])
        .filter(
          (
            row
          ): row is RankingJoinRow & {
            rating_value: number
            player_profiles: NonNullable<RankingJoinRow['player_profiles']>
          } => row.rating_value !== null && row.player_profiles !== null
        )
        .map((row) => ({
          player_id: row.player_id,
          display_name: row.player_profiles.display_name,
          rating_value: row.rating_value,
          confidence_score: row.confidence_score,
          matches_played: row.matches_played,
          provisional: row.provisional,
          province: row.player_profiles.province,
          city: row.player_profiles.city
        }))
    }
  }
}
