import type { SupabaseClient } from '@supabase/supabase-js'
import { createTournamentPlacementRepository } from './tournament-placement.repository'

/**
 * Everything the achievement evaluator needs to know about one player, read
 * from the tables that own each fact.
 *
 * Deliberately a read-only projection across domains rather than a column on
 * player_profiles: a denormalised counter would be a second source of truth for
 * numbers that already exist, and the one thing this feature cannot afford is a
 * badge that disagrees with the record it claims to summarise.
 *
 * Every count is a `head: true` count query — the rows themselves are never
 * fetched, so a player with 400 matches costs the same as one with 4.
 */
export interface PlayerAchievementStats {
  /** Verified matches this player appears in. */
  matches_played: number
  /** Verified matches this player's side won. */
  matches_won: number
  /** Highest rating held across rating types, or null while unrated. */
  best_rating: number | null
  /** Whether any rating row has a value — 'rated_player' turns on this, not on a threshold. */
  is_rated: boolean
  followers: number
  /** Active club memberships. */
  clubs_joined: number
  created_a_club: boolean
  /** Tournament registrations, excluding cancelled ones. */
  tournament_registrations: number
  /**
   * Draws whose final was won by a registration this player is on.
   *
   * Counted per category, not per tournament: a tournament's categories are
   * separate competitions sharing one bracket table, so winning the 3.5 doubles
   * is one title whether or not the 4.0 singles ran alongside it.
   */
  tournament_wins: number
  /** Draws whose final was lost by a registration this player is on. */
  tournament_runner_ups: number
}

export interface AchievementStatsRepository {
  gather(playerId: string, userId: string | null): Promise<PlayerAchievementStats>
}

/**
 * Needs the service-role client. Several of these tables are readable only as
 * their owner under RLS (club_memberships, player_ratings), and the evaluator
 * runs from server-side hooks and a scheduled admin job where there is no
 * signed-in identity to read as.
 */
export function createAchievementStatsRepository(
  client: SupabaseClient
): AchievementStatsRepository {
  async function countMatches(playerId: string, wonOnly: boolean): Promise<number> {
    // match_participants carries result_status, but a participant row exists
    // for pending matches too. The join filters to matches that actually
    // settled, which is the only kind that should move a milestone.
    let builder = client
      .from('match_participants')
      .select('match_id, matches!inner(status)', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .eq('matches.status', 'verified')

    if (wonOnly) builder = builder.eq('result_status', 'won')

    const { count, error } = await builder
    if (error) throw error
    return count ?? 0
  }

  return {
    async gather(playerId, userId) {
      const [
        matchesPlayed,
        matchesWon,
        ratingRows,
        followers,
        clubsJoined,
        createdClubs,
        registrations
      ] = await Promise.all([
        countMatches(playerId, false),
        countMatches(playerId, true),
        client.from('player_ratings').select('rating_value').eq('player_id', playerId),
        client
          .from('player_relationships')
          .select('id', { count: 'exact', head: true })
          .eq('to_player_id', playerId)
          .eq('relationship_type', 'follow')
          .eq('status', 'active'),
        client
          .from('club_memberships')
          .select('id', { count: 'exact', head: true })
          .eq('player_id', playerId)
          .eq('status', 'active'),
        // Clubs record their creator by account, not by player profile, so a
        // player with no user_id (there is no such row today, but the type
        // allows it) simply cannot hold this one.
        userId
          ? client
              .from('clubs')
              .select('id', { count: 'exact', head: true })
              .eq('created_by_user_id', userId)
          : Promise.resolve({ count: 0, error: null }),
        client
          .from('tournament_registrations')
          .select('id, tournament_id', { count: 'exact' })
          .eq('player_id', playerId)
          .neq('status', 'cancelled')
      ])

      for (const result of [ratingRows, followers, clubsJoined, createdClubs, registrations]) {
        if (result.error) throw result.error
      }

      const ratings = ((ratingRows.data ?? []) as { rating_value: number | null }[])
        .map((r) => r.rating_value)
        .filter((v): v is number => v !== null)

      const registrationRows = (registrations.data ?? []) as {
        id: string
        tournament_id: string
      }[]
      const placements =
        await createTournamentPlacementRepository(client).findByRegistrations(registrationRows)

      return {
        matches_played: matchesPlayed,
        matches_won: matchesWon,
        best_rating: ratings.length ? Math.max(...ratings) : null,
        is_rated: ratings.length > 0,
        followers: followers.count ?? 0,
        clubs_joined: clubsJoined.count ?? 0,
        created_a_club: (createdClubs.count ?? 0) > 0,
        tournament_registrations: registrations.count ?? 0,
        tournament_wins: placements.filter((p) => p.placement === 1).length,
        tournament_runner_ups: placements.filter((p) => p.placement === 2).length
      }
    }
  }
}
