import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateTournamentCategoryInput,
  TournamentCategoryRecord,
  TournamentCategoryTemplateRecord,
  UpdateTournamentCategoryInput
} from '../dto/tournament-category.dto'

const CATEGORY_COLUMNS =
  'id, tournament_id, template_id, name, category_type, min_rating, max_rating, max_participants, ' +
  'display_order, status, created_at, updated_at'

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
          display_order: input.display_order ?? 0
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
    }
  }
}
