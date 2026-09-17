import type { SupabaseClient } from '@supabase/supabase-js'
import type { GiveKudosInput, KudosRecord } from '../dto/kudos.dto'

const KUDOS_COLUMNS = 'id, match_id, from_player_id, to_player_id, skill, created_at'

export interface KudosRepository {
  create(input: GiveKudosInput, fromPlayerId: string): Promise<KudosRecord>
  /** Kudos this player has given in this match — the "already done" check. */
  findByMatchAndGiver(matchId: string, fromPlayerId: string): Promise<KudosRecord[]>
  /** Every kudos a player has received, tallied by skill. */
  countByPlayer(playerId: string): Promise<Record<string, number>>
}

export function createKudosRepository(client: SupabaseClient): KudosRepository {
  return {
    async create(input, fromPlayerId) {
      const { data, error } = await client
        .from('match_kudos')
        .insert({
          match_id: input.match_id,
          from_player_id: fromPlayerId,
          to_player_id: input.to_player_id,
          skill: input.skill
        })
        .select(KUDOS_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as KudosRecord
    },

    async findByMatchAndGiver(matchId, fromPlayerId) {
      const { data, error } = await client
        .from('match_kudos')
        .select(KUDOS_COLUMNS)
        .eq('match_id', matchId)
        .eq('from_player_id', fromPlayerId)

      if (error) throw error
      return (data ?? []) as unknown as KudosRecord[]
    },

    async countByPlayer(playerId) {
      // Only the skill column is fetched — the tally needs no ids, and a player
      // with hundreds of kudos should not pay for hundreds of full rows.
      // Postgres could group this itself, but PostgREST cannot express a
      // GROUP BY without a view or an RPC, and neither is worth a migration for
      // a count over an indexed column.
      const { data, error } = await client
        .from('match_kudos')
        .select('skill')
        .eq('to_player_id', playerId)

      if (error) throw error

      const counts: Record<string, number> = {}
      for (const row of (data ?? []) as { skill: string }[]) {
        counts[row.skill] = (counts[row.skill] ?? 0) + 1
      }
      return counts
    }
  }
}
