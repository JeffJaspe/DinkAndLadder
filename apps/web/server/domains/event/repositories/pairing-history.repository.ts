import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Provides match history for smart queue pairing.
 * Returns who has partnered and faced whom in this event.
 */
export function createPairingHistoryRepository(client: SupabaseClient) {
  return {
    async getEventMatchHistory(eventId: string) {
      const { data, error } = await client
        .from('matches')
        .select(
          `
          id,
          match_participants (
            player_id,
            team_number
          )
        `
        )
        .eq('event_id', eventId)
        .eq('status', 'verified')

      if (error) {
        console.error('Failed to load match history for pairing:', error)
        return []
      }

      return (data ?? []).map((match) => {
        const participants = (match.match_participants ?? []) as Array<{
          player_id: string
          team_number: number
        }>
        return {
          team1_players: participants.filter((p) => p.team_number === 1).map((p) => p.player_id),
          team2_players: participants.filter((p) => p.team_number === 2).map((p) => p.player_id)
        }
      })
    }
  }
}

/**
 * Provides player ratings for rating-based queue pairing.
 */
export function createPlayerRatingsRepository(client: SupabaseClient) {
  return {
    async getRatings(playerIds: string[]): Promise<Map<string, number>> {
      if (playerIds.length === 0) return new Map()

      const { data, error } = await client
        .from('player_profiles')
        .select('id, rating')
        .in('id', playerIds)

      if (error) {
        console.error('Failed to load player ratings for pairing:', error)
        return new Map()
      }

      const ratings = new Map<string, number>()
      for (const player of data ?? []) {
        if (player.rating != null) {
          ratings.set(player.id, player.rating)
        }
      }
      return ratings
    }
  }
}
