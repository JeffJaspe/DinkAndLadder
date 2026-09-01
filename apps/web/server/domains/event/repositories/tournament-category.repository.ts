import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateTournamentCategoryInput,
  TournamentCategoryRecord,
  TournamentCategoryTemplateRecord,
  UpdateTournamentCategoryInput
} from '../dto/tournament-category.dto'

const CATEGORY_COLUMNS =
  'id, tournament_id, template_id, name, category_type, min_rating, max_rating, max_participants, ' +
  'display_order, status, match_type, format, bracket_locked_at, bracket_locked_by_player_id, ' +
  'games_default, round_game_rules, target_points, win_by_two, ' +
  'created_at, updated_at'

const TEMPLATE_COLUMNS = 'id, name, min_rating, max_rating, display_order'

export interface TournamentCategoryRepository {
  findById(categoryId: string): Promise<TournamentCategoryRecord | null>
  findByTournamentId(tournamentId: string): Promise<TournamentCategoryRecord[]>
  create(input: CreateTournamentCategoryInput): Promise<TournamentCategoryRecord>
  update(
    categoryId: string,
    input: UpdateTournamentCategoryInput
  ): Promise<TournamentCategoryRecord>
  listTemplates(): Promise<TournamentCategoryTemplateRecord[]>
  /** How many of this category's bracket slots carry a played match. */
  countRecordedResults(categoryId: string): Promise<number>
  /**
   * Slots still waiting on a result. A `bye` is decided by definition — nobody
   * plays it — so only pending, ready and in_progress count as outstanding.
   */
  countUndecidedMatches(categoryId: string): Promise<number>
  /**
   * Hard delete, leaves first.
   *
   * Every FK into a category is RESTRICT — nothing cascades anywhere in this
   * schema (see `deleteWithChildren` in event.repository.ts) — so the order
   * here is load-bearing, not tidiness. PostgREST gives no transaction, so a
   * failure part-way leaves the leaves gone and the category present; that is
   * recoverable by repeating the call, which the service does not prevent.
   */
  deleteWithChildren(categoryId: string): Promise<void>
  /**
   * Freeze or unfreeze this category's draw. `playerId` of null clears both
   * columns together — a lock and its owner are one fact, not two.
   */
  setBracketLock(categoryId: string, playerId: string | null): Promise<TournamentCategoryRecord>
}

export function createTournamentCategoryRepository(
  client: SupabaseClient
): TournamentCategoryRepository {
  return {
    async findById(categoryId) {
      const { data, error } = await client
        .from('tournament_categories')
        .select(CATEGORY_COLUMNS)
        .eq('id', categoryId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as TournamentCategoryRecord | null
    },

    async findByTournamentId(tournamentId) {
      const { data, error } = await client
        .from('tournament_categories')
        .select(CATEGORY_COLUMNS)
        .eq('tournament_id', tournamentId)
        .order('display_order', { ascending: true })

      if (error) throw error
      return (data ?? []) as unknown as TournamentCategoryRecord[]
    },

    async create(input) {
      const { data, error } = await client
        .from('tournament_categories')
        .insert({
          tournament_id: input.tournament_id,
          template_id: input.template_id ?? null,
          name: input.name,
          category_type: input.category_type,
          min_rating: input.min_rating ?? null,
          max_rating: input.max_rating ?? null,
          max_participants: input.max_participants ?? null,
          display_order: input.display_order ?? 0,
          match_type: input.match_type ?? null,
          format: input.format ?? null
        })
        .select(CATEGORY_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as TournamentCategoryRecord
    },

    async update(categoryId, input) {
      // Only copy keys the caller actually supplied, so a partial patch does
      // not blank the fields it left out.
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.name !== undefined) patch.name = input.name
      if (input.min_rating !== undefined) patch.min_rating = input.min_rating
      if (input.max_rating !== undefined) patch.max_rating = input.max_rating
      if (input.max_participants !== undefined) patch.max_participants = input.max_participants
      if (input.display_order !== undefined) patch.display_order = input.display_order
      if (input.status !== undefined) patch.status = input.status
      if (input.match_type !== undefined) patch.match_type = input.match_type
      if (input.format !== undefined) patch.format = input.format

      const { data, error } = await client
        .from('tournament_categories')
        .update(patch)
        .eq('id', categoryId)
        .select(CATEGORY_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as TournamentCategoryRecord
    },

    async listTemplates() {
      const { data, error } = await client
        .from('tournament_category_templates')
        .select(TEMPLATE_COLUMNS)
        .order('display_order', { ascending: true })

      if (error) throw error
      return (data ?? []) as unknown as TournamentCategoryTemplateRecord[]
    },

    async countRecordedResults(categoryId) {
      const { count, error } = await client
        .from('bracket_matches')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', categoryId)
        .not('match_id', 'is', null)

      if (error) throw error
      return count ?? 0
    },

    async countUndecidedMatches(categoryId) {
      const { count, error } = await client
        .from('bracket_matches')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', categoryId)
        .in('status', ['pending', 'ready', 'in_progress'])

      if (error) throw error
      return count ?? 0
    },

    async setBracketLock(categoryId, playerId) {
      const { data, error } = await client
        .from('tournament_categories')
        .update({
          bracket_locked_at: playerId ? new Date().toISOString() : null,
          bracket_locked_by_player_id: playerId,
          updated_at: new Date().toISOString()
        })
        .eq('id', categoryId)
        .select(CATEGORY_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as TournamentCategoryRecord
    },

    async deleteWithChildren(categoryId) {
      // Bracket slots reference registrations, so they go before them.
      const { error: bracketError } = await client
        .from('bracket_matches')
        .delete()
        .eq('category_id', categoryId)
      if (bracketError) throw bracketError

      const { error: registrationError } = await client
        .from('tournament_registrations')
        .delete()
        .eq('category_id', categoryId)
      if (registrationError) throw registrationError

      const { error } = await client.from('tournament_categories').delete().eq('id', categoryId)
      if (error) throw error
    }
  }
}
