import type { SupabaseClient } from '@supabase/supabase-js'
import type { BracketMatchRecord, BracketMatchStatus, UpdateBracketMatchInput } from '../dto/bracket.dto'

const BRACKET_MATCH_COLUMNS =
  'id, tournament_id, round, position, match_id, participant1_registration_id, ' +
  'participant2_registration_id, winner_registration_id, status, scheduled_at, created_at'

export interface BracketRepository {
  findById(bracketMatchId: string): Promise<BracketMatchRecord | null>
  findByTournamentId(tournamentId: string): Promise<BracketMatchRecord[]>
  createMany(matches: Omit<BracketMatchRecord, 'id' | 'created_at'>[]): Promise<BracketMatchRecord[]>
  update(bracketMatchId: string, input: UpdateBracketMatchInput): Promise<BracketMatchRecord>
  deleteByTournamentId(tournamentId: string): Promise<void>
}

export function createBracketRepository(client: SupabaseClient): BracketRepository {
  return {
    async findById(bracketMatchId) {
      const { data, error } = await client
        .from('bracket_matches')
        .select(BRACKET_MATCH_COLUMNS)
        .eq('id', bracketMatchId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as BracketMatchRecord | null
    },

    async findByTournamentId(tournamentId) {
      const { data, error } = await client
        .from('bracket_matches')
        .select(BRACKET_MATCH_COLUMNS)
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('position', { ascending: true })

      if (error) throw error
      return (data ?? []) as unknown as BracketMatchRecord[]
    },

    async createMany(matches) {
      const { data, error } = await client
        .from('bracket_matches')
        .insert(matches)
        .select(BRACKET_MATCH_COLUMNS)

      if (error) throw error
      return (data ?? []) as unknown as BracketMatchRecord[]
    },

    async update(bracketMatchId, input) {
      const updateData: Record<string, unknown> = {}
      if (input.match_id !== undefined) updateData.match_id = input.match_id
      if (input.winner_registration_id !== undefined)
        updateData.winner_registration_id = input.winner_registration_id
      if (input.status !== undefined) updateData.status = input.status
      if (input.scheduled_at !== undefined) updateData.scheduled_at = input.scheduled_at

      const { data, error } = await client
        .from('bracket_matches')
        .update(updateData)
        .eq('id', bracketMatchId)
        .select(BRACKET_MATCH_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as BracketMatchRecord
    },

    async deleteByTournamentId(tournamentId) {
      const { error } = await client
        .from('bracket_matches')
        .delete()
        .eq('tournament_id', tournamentId)

      if (error) throw error
    }
  }
}
