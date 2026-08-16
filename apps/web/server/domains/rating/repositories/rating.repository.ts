import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PlayerRatingRecord,
  RatingTransactionRecord,
  RatingType,
  RatingUpdateResult
} from '../dto/rating.dto'

const PLAYER_RATING_SELECT =
  'id, player_id, rating_type, rating_value, confidence_score, matches_played, provisional, calculated_at, created_at, updated_at'

const RATING_TRANSACTION_SELECT =
  'id, player_id, rating_type, match_id, old_rating, new_rating, rating_delta, confidence_before, confidence_after, calculation_version, created_at'

export interface RatingRepository {
  getRating(playerId: string, ratingType: RatingType): Promise<PlayerRatingRecord | null>
  getRatingsForPlayers(playerIds: string[], ratingType: RatingType): Promise<PlayerRatingRecord[]>
  getRatingHistory(playerId: string, ratingType: RatingType): Promise<RatingTransactionRecord[]>
  hasTransactionsForMatch(matchId: string): Promise<boolean>
  /** Persists every player's new rating state and their immutable transaction row for this
   * match. Sequential Supabase calls, not a single DB transaction — same tradeoff already
   * accepted for match submission (see MatchRepository.create); acceptable for MVP scope. */
  applyRatingUpdates(
    matchId: string,
    ratingType: RatingType,
    calculationVersion: number,
    updates: RatingUpdateResult[]
  ): Promise<void>
}

export function createRatingRepository(client: SupabaseClient): RatingRepository {
  return {
    async getRating(playerId, ratingType) {
      const { data, error } = await client
        .from('player_ratings')
        .select(PLAYER_RATING_SELECT)
        .eq('player_id', playerId)
        .eq('rating_type', ratingType)
        .maybeSingle()

      if (error) throw error
      return data as unknown as PlayerRatingRecord | null
    },

    async getRatingsForPlayers(playerIds, ratingType) {
      const { data, error } = await client
        .from('player_ratings')
        .select(PLAYER_RATING_SELECT)
        .eq('rating_type', ratingType)
        .in('player_id', playerIds)

      if (error) throw error
      return (data ?? []) as unknown as PlayerRatingRecord[]
    },

    async getRatingHistory(playerId, ratingType) {
      const { data, error } = await client
        .from('rating_transactions')
        .select(RATING_TRANSACTION_SELECT)
        .eq('player_id', playerId)
        .eq('rating_type', ratingType)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as unknown as RatingTransactionRecord[]
    },

    async hasTransactionsForMatch(matchId) {
      const { count, error } = await client
        .from('rating_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('match_id', matchId)

      if (error) throw error
      return (count ?? 0) > 0
    },

    async applyRatingUpdates(matchId, ratingType, calculationVersion, updates) {
      for (const update of updates) {
        const { error: upsertError } = await client.from('player_ratings').upsert(
          {
            player_id: update.player_id,
            rating_type: ratingType,
            rating_value: update.new_rating,
            confidence_score: update.confidence_after,
            matches_played: update.new_matches_played,
            calculated_at: new Date().toISOString()
          },
          { onConflict: 'player_id,rating_type' }
        )
        if (upsertError) throw upsertError
      }

      const { error: insertError } = await client.from('rating_transactions').insert(
        updates.map((update) => ({
          player_id: update.player_id,
          rating_type: ratingType,
          match_id: matchId,
          old_rating: update.old_rating,
          new_rating: update.new_rating,
          rating_delta: update.rating_delta,
          confidence_before: update.confidence_before,
          confidence_after: update.confidence_after,
          calculation_version: calculationVersion
        }))
      )
      if (insertError) throw insertError
    }
  }
}
