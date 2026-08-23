import type { EventRepository } from '../repositories/event.repository'
import type {
  TournamentRegistrationRepository,
  TournamentRepository
} from '../repositories/tournament.repository'
import type { TournamentCategoryRepository } from '../repositories/tournament-category.repository'
import type {
  CreateTournamentCategoryInput,
  TournamentCategoryDto,
  UpdateTournamentCategoryInput
} from '../dto/tournament-category.dto'
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
  updateCategory(
    actingPlayerId: string,
    categoryId: string,
    input: UpdateTournamentCategoryInput
  ): Promise<TournamentCategoryDto>
  listForTournament(tournamentId: string): Promise<TournamentCategoryDto[]>
  listTemplates(): Promise<ReturnType<typeof toTournamentCategoryTemplateDto>[]>
}

/**
 * `registrations` is optional so the read-only callers
 * (categories/index.get.ts, tournament-category-templates.get.ts) don't have to
 * construct a repository they never use. updateCategory needs it to check a
 * capacity change against the confirmed count and says so if it is missing.
 */
export function createTournamentCategoryService(
  categories: TournamentCategoryRepository,
  tournaments: TournamentRepository,
  events: EventRepository,
  registrations?: TournamentRegistrationRepository
): TournamentCategoryService {
  /**
   * A category's size must never be set below the number of players already
   * confirmed into it — that would render vacancy negative and imply places
   * that have to be taken away from someone.
   */
  function assertCapacityFitsConfirmed(maxParticipants: number, confirmedCount: number) {
    if (maxParticipants < confirmedCount) {
      throw new EventServiceError(
        409,
        'CAPACITY_BELOW_CONFIRMED',
        `This category already has ${confirmedCount} confirmed ${
          confirmedCount === 1 ? 'player' : 'players'
        }, so it cannot be limited to ${maxParticipants}.`
      )
    }
  }

  function assertValidCapacity(maxParticipants: number | null | undefined) {
    if (maxParticipants === null || maxParticipants === undefined) return
    if (!Number.isInteger(maxParticipants) || maxParticipants < 2) {
      throw new EventServiceError(
        400,
        'VALIDATION_ERROR',
        'Number of players must be a whole number of at least 2.'
      )
    }
  }

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
    assertValidCapacity(input.max_participants)
    const record = await categories.create(input)
    return toTournamentCategoryDto(record)
  }

  return {
    async updateCategory(actingPlayerId, categoryId, input) {
      const category = await categories.findById(categoryId)
      if (!category) {
        throw new EventServiceError(404, 'NOT_FOUND', 'Category not found.')
      }
      await assertTournamentOrganizer(actingPlayerId, category.tournament_id)

      if (input.max_participants !== undefined && input.max_participants !== null) {
        assertValidCapacity(input.max_participants)

        if (!registrations) {
          throw new EventServiceError(
            500,
            'INTERNAL_ERROR',
            'Cannot verify capacity without the registration repository.'
          )
        }
        const all = await registrations.findByTournamentId(category.tournament_id)
        const confirmed = all.filter(
          (r) => r.category_id === categoryId && r.status === 'confirmed'
        ).length
        assertCapacityFitsConfirmed(input.max_participants, confirmed)
      }

      const record = await categories.update(categoryId, input)
      return toTournamentCategoryDto(record)
    },

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
