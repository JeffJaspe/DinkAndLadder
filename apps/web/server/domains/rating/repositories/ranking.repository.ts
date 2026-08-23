import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeLikePattern } from '../../shared/escape-like'
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
    barangay: string | null
  } | null
}

export interface RankingRepository {
  /** Ordered by rating_value descending. Only non-null ratings for players whose profile is
   * public are returned — see the Player domain's `player_profiles_select_public` RLS policy
   * and this query's own `!inner` join, which is what actually enforces the visibility filter
   * (RLS alone would just silently drop non-visible rows from the embed, not filter on it). */
  getRankings(query: RankingQuery): Promise<RankingRow[]>

  /**
   * Total rows matching the same filters, ignoring paging. Needed so the UI can
   * render real pagination instead of a fixed row of buttons.
   */
  countRankings(query: RankingQuery): Promise<number>

  /**
   * Net rating change per player since `sinceIso`, for the trend column.
   * Players with no rated match in the window are absent from the map — that is
   * meaningfully different from a zero delta.
   */
  getTrendDeltas(
    playerIds: string[],
    ratingType: RankingQuery['rating_type'],
    sinceIso: string
  ): Promise<Map<string, number>>
}

export function createRankingRepository(client: SupabaseClient): RankingRepository {
  return {
    async countRankings(query) {
      // These filters mirror getRankings exactly. They are written out rather
      // than shared through a helper because Supabase's builder type changes
      // shape with `head: true`, and a generic wrapper would need casts that
      // hide exactly the drift worth catching. If you change one, change both:
      // a count that disagrees with the page produces pagination pointing at
      // empty pages.
      let builder = client
        .from('player_ratings')
        .select('player_id, player_profiles!inner(profile_visibility, province, city, barangay)', {
          count: 'exact',
          head: true
        })
        .eq('rating_type', query.rating_type)
        .not('rating_value', 'is', null)
        .eq('player_profiles.profile_visibility', 'public')

      if (query.province) builder = builder.eq('player_profiles.province', query.province)
      if (query.city) builder = builder.eq('player_profiles.city', query.city)
      if (query.barangay) builder = builder.eq('player_profiles.barangay', query.barangay)
      if (query.q) {
        builder = builder.ilike('player_profiles.display_name', `%${escapeLikePattern(query.q)}%`)
      }

      const { count, error } = await builder
      if (error) throw error
      return count ?? 0
    },

    async getTrendDeltas(playerIds, ratingType, sinceIso) {
      const deltas = new Map<string, number>()
      if (!playerIds.length) return deltas

      // Summed in application code rather than SQL: Supabase's REST layer has no
      // GROUP BY, and the alternative is a database view. One page is at most
      // RANKING_MAX_LIMIT players, so this stays a bounded read.
      const { data, error } = await client
        .from('rating_transactions')
        .select('player_id, rating_delta')
        .eq('rating_type', ratingType)
        .in('player_id', playerIds)
        .gte('created_at', sinceIso)

      if (error) throw error

      for (const row of (data ?? []) as { player_id: string, rating_delta: number | null }[]) {
        if (row.rating_delta === null) continue
        deltas.set(row.player_id, (deltas.get(row.player_id) ?? 0) + row.rating_delta)
      }
      return deltas
    },

    async getRankings(query) {
      let builder = client
        .from('player_ratings')
        .select(
          'player_id, rating_value, confidence_score, matches_played, provisional, player_profiles!inner(display_name, province, city, barangay)'
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
      if (query.barangay) {
        builder = builder.eq('player_profiles.barangay', query.barangay)
      }
      if (query.q) {
        builder = builder.ilike('player_profiles.display_name', `%${escapeLikePattern(query.q)}%`)
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
          city: row.player_profiles.city,
          barangay: row.player_profiles.barangay
        }))
    }
  }
}
