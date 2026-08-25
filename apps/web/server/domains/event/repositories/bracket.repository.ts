import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  BracketMatchRecord,
  BracketMatchStatus,
  UpdateBracketMatchInput
} from '../dto/bracket.dto'

const BRACKET_MATCH_COLUMNS =
  'id, tournament_id, round, position, match_id, participant1_registration_id, ' +
  'participant2_registration_id, winner_registration_id, status, scheduled_at, created_at, category_id'

export interface BracketRepository {
  findById(bracketMatchId: string): Promise<BracketMatchRecord | null>
  /**
   * categoryId omitted → all matches for the tournament, regardless of category (used
   * when a tournament has no categories at all). categoryId === null → only matches with
   * no category. categoryId === a string → only that category's matches.
   */
  findByTournamentId(
    tournamentId: string,
    categoryId?: string | null
  ): Promise<BracketMatchRecord[]>
  createMany(
    matches: Omit<BracketMatchRecord, 'id' | 'created_at'>[]
  ): Promise<BracketMatchRecord[]>
  update(bracketMatchId: string, input: UpdateBracketMatchInput): Promise<BracketMatchRecord>
  /**
   * Places an advancing entrant into a downstream slot.
   *
   * Deliberately separate from update(): UpdateBracketMatchInput is the shape
   * the PATCH endpoint accepts from an organiser, and participants must not be
   * settable from there — who occupies a slot is derived from results, never
   * supplied by the caller. Only the service's advancement logic calls this.
   */
  setParticipant(
    bracketMatchId: string,
    slot: 1 | 2,
    registrationId: string,
    status: BracketMatchStatus
  ): Promise<BracketMatchRecord>
  deleteByTournamentId(tournamentId: string, categoryId?: string | null): Promise<void>
  /**
   * How many slots in this draw already carry a played match.
   *
   * Guards undo and unlock: a `bracket_matches` row can be deleted, but the
   * `matches` row it points at carries a verified result that has already moved
   * people's ratings, and deleting that to tidy up a draw would be the wrong
   * trade. Non-zero means the draw is part of the record now.
   */
  countRecordedResults(tournamentId: string, categoryId?: string | null): Promise<number>
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

    async findByTournamentId(tournamentId, categoryId) {
      let builder = client
        .from('bracket_matches')
        .select(BRACKET_MATCH_COLUMNS)
        .eq('tournament_id', tournamentId)
      if (categoryId !== undefined) {
        builder =
          categoryId === null
            ? builder.is('category_id', null)
            : builder.eq('category_id', categoryId)
      }
      const { data, error } = await builder
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

    async setParticipant(bracketMatchId, slot, registrationId, status) {
      const column = slot === 1 ? 'participant1_registration_id' : 'participant2_registration_id'

      const { data, error } = await client
        .from('bracket_matches')
        .update({ [column]: registrationId, status })
        .eq('id', bracketMatchId)
        .select(BRACKET_MATCH_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as BracketMatchRecord
    },

    async countRecordedResults(tournamentId, categoryId) {
      let builder = client
        .from('bracket_matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .not('match_id', 'is', null)

      if (categoryId !== undefined) {
        builder =
          categoryId === null
            ? builder.is('category_id', null)
            : builder.eq('category_id', categoryId)
      }

      const { count, error } = await builder
      if (error) throw error
      return count ?? 0
    },

    async deleteByTournamentId(tournamentId, categoryId) {
      let builder = client.from('bracket_matches').delete().eq('tournament_id', tournamentId)
      if (categoryId !== undefined) {
        builder =
          categoryId === null
            ? builder.is('category_id', null)
            : builder.eq('category_id', categoryId)
      }
      const { error } = await builder

      if (error) throw error
    }
  }
}
