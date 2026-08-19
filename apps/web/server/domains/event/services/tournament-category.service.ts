import type { EventRepository } from '../repositories/event.repository'
import type { TournamentRepository } from '../repositories/tournament.repository'
import type { TournamentCategoryRepository } from '../repositories/tournament-category.repository'
import type { CreateTournamentCategoryInput, TournamentCategoryDto } from '../dto/tournament-category.dto'
import { toTournamentCategoryDto, toTournamentCategoryTemplateDto } from '../dto/tournament-category.dto'
import { EventServiceError } from './event.service'

export interface CreateCategoryFromTemplateInput {
  template_id: string
  max_participants?: number | null
  display_order?: number
}

export interface CreateCustomCategoryInput {
  name: string
  min_rating?: number | null
  max_rating?: number | null
  max_participants?: number | null
  display_order?: number
}

export interface TournamentCategoryService {
  createFromTemplate(
    actingPlayerId: string,
    tournamentId: string,
    input: CreateCategoryFromTemplateInput
  ): Promise<TournamentCategoryDto>
  createCustom(
    actingPlayerId: string,
    tournamentId: string,
    input: CreateCustomCategoryInput
  ): Promise<TournamentCategoryDto>
  listForTournament(tournamentId: string): Promise<TournamentCategoryDto[]>
  listTemplates(): Promise<ReturnType<typeof toTournamentCategoryTemplateDto>[]>
}

export function createTournamentCategoryService(
  categories: TournamentCategoryRepository,
  tournaments: TournamentRepository,
  events: EventRepository
): TournamentCategoryService {
  async function assertTournamentOrganizer(actingPlayerId: string, tournamentId: string) {
    const tournament = await tournaments.findById(tournamentId)
    if (!tournament) {
      throw new EventServiceError(404, 'NOT_FOUND', 'Tournament not found.')
    }
    const event = await events.findById(tournament.event_id)
    if (!event || event.created_by_player_id !== actingPlayerId) {
      throw new EventServiceError(
        403,
        'FORBIDDEN',
        'Only the event organizer can manage tournament categories.'
      )
    }
    return tournament
  }

  async function createCategory(
    actingPlayerId: string,
    tournamentId: string,
    input: CreateTournamentCategoryInput
  ) {
    await assertTournamentOrganizer(actingPlayerId, tournamentId)
    const record = await categories.create(input)
    return toTournamentCategoryDto(record)
  }

  return {
    async createFromTemplate(actingPlayerId, tournamentId, input) {
      const templates = await categories.listTemplates()
      const template = templates.find((t) => t.id === input.template_id)
      if (!template) {
        throw new EventServiceError(404, 'NOT_FOUND', 'Category template not found.')
      }
      return createCategory(actingPlayerId, tournamentId, {
        tournament_id: tournamentId,
        template_id: template.id,
        name: template.name,
        category_type: 'predefined',
        min_rating: template.min_rating,
        max_rating: template.max_rating,
        max_participants: input.max_participants,
        display_order: input.display_order
      })
    },

    async createCustom(actingPlayerId, tournamentId, input) {
      return createCategory(actingPlayerId, tournamentId, {
        tournament_id: tournamentId,
        category_type: 'custom',
        name: input.name,
        min_rating: input.min_rating,
        max_rating: input.max_rating,
        max_participants: input.max_participants,
        display_order: input.display_order
      })
    },

    async listForTournament(tournamentId) {
      const records = await categories.findByTournamentId(tournamentId)
      return records.map(toTournamentCategoryDto)
    },

    async listTemplates() {
      const records = await categories.listTemplates()
      return records.map(toTournamentCategoryTemplateDto)
    }
  }
}
