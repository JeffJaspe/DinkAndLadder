export type TournamentCategoryType = 'predefined' | 'custom'
export type TournamentCategoryStatus = 'open' | 'closed' | 'completed'

export interface TournamentCategoryRecord {
  id: string
  tournament_id: string
  template_id: string | null
  name: string
  category_type: TournamentCategoryType
  min_rating: number | null
  max_rating: number | null
  max_participants: number | null
  display_order: number
  status: TournamentCategoryStatus
  created_at: string
  updated_at: string
}

export interface TournamentCategoryDto {
  id: string
  tournament_id: string
  template_id: string | null
  name: string
  category_type: TournamentCategoryType
  min_rating: number | null
  max_rating: number | null
  max_participants: number | null
  display_order: number
  status: TournamentCategoryStatus
}

export function toTournamentCategoryDto(record: TournamentCategoryRecord): TournamentCategoryDto {
  return {
    id: record.id,
    tournament_id: record.tournament_id,
    template_id: record.template_id,
    name: record.name,
    category_type: record.category_type,
    min_rating: record.min_rating,
    max_rating: record.max_rating,
    max_participants: record.max_participants,
    display_order: record.display_order,
    status: record.status
  }
}

export interface CreateTournamentCategoryInput {
  tournament_id: string
  template_id?: string | null
  name: string
  category_type: TournamentCategoryType
  min_rating?: number | null
  max_rating?: number | null
  max_participants?: number | null
  display_order?: number
}

export interface TournamentCategoryTemplateRecord {
  id: string
  name: string
  min_rating: number | null
  max_rating: number | null
  display_order: number
}

export interface TournamentCategoryTemplateDto {
  id: string
  name: string
  min_rating: number | null
  max_rating: number | null
  display_order: number
}

export function toTournamentCategoryTemplateDto(
  record: TournamentCategoryTemplateRecord
): TournamentCategoryTemplateDto {
  return {
    id: record.id,
    name: record.name,
    min_rating: record.min_rating,
    max_rating: record.max_rating,
    display_order: record.display_order
  }
}

/**
 * Fields an organiser may change on an existing category. Deliberately narrower
 * than CreateTournamentCategoryInput: tournament_id, template_id and
 * category_type identify the row's origin and must not be rewritten.
 */
export interface UpdateTournamentCategoryInput {
  name?: string
  min_rating?: number | null
  max_rating?: number | null
  max_participants?: number | null
  display_order?: number
  status?: TournamentCategoryStatus
}
