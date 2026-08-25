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
import {
  toTournamentCategoryDto,
  toTournamentCategoryTemplateDto
} from '../dto/tournament-category.dto'
import type { TournamentFormat, TournamentMatchType } from '../dto/tournament.dto'
import { isTournamentFormat, TOURNAMENT_FORMAT_VALUES } from '~/utils/tournament-formats'
import { EventServiceError } from './event.service'

export interface CreateCategoryFromTemplateInput {
  template_id: string
  max_participants?: number | null
  display_order?: number
  /** Omitted means "same as the tournament". */
  match_type?: TournamentMatchType | null
  /** Omitted means "same as the tournament". */
  format?: TournamentFormat | null
}

export interface CreateCustomCategoryInput {
  name: string
  min_rating?: number | null
  max_rating?: number | null
  max_participants?: number | null
  display_order?: number
  match_type?: TournamentMatchType | null
  format?: TournamentFormat | null
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
  /**
   * Bin a category that will not be played — postponed, cancelled, or set up by
   * mistake. Hard delete of the category, its entries and its draw.
   *
   * Deliberately hard, per the project's data-hygiene rule: soft deletion is
   * reserved for personal data and for records of things that happened. A
   * category nobody played is neither.
   */
  deleteCategory(actingPlayerId: string, categoryId: string): Promise<void>
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

  function assertValidMatchType(matchType: TournamentMatchType | null | undefined) {
    if (matchType === null || matchType === undefined) return
    if (matchType !== 'singles' && matchType !== 'doubles') {
      throw new EventServiceError(
        400,
        'VALIDATION_ERROR',
        'A category is played in either singles or doubles.'
      )
    }
  }

  /**
   * The database carries the same list as a CHECK constraint
   * (031-tournament-format), but a constraint violation surfaces as an opaque
   * 500. Checking here means the organiser is told which value was wrong.
   */
  function assertValidFormat(format: TournamentFormat | null | undefined) {
    if (format === null || format === undefined) return
    if (!isTournamentFormat(format)) {
      throw new EventServiceError(
        400,
        'VALIDATION_ERROR',
        `'${format}' is not a tournament format. Choose one of: ` +
          `${TOURNAMENT_FORMAT_VALUES.join(', ')}.`
      )
    }
  }

  /**
   * Switching singles ↔ doubles once people have entered would orphan the
   * partner every doubles entry carries, and silently leave singles entries in
   * a category that now demands a partner. Withdrawn and rejected entries are
   * ignored — they hold nothing.
   */
  function assertMatchTypeChangeIsSafe(
    current: TournamentMatchType | null,
    next: TournamentMatchType | null | undefined,
    entrantCount: number
  ) {
    if (next === undefined || next === null || next === current) return
    if (entrantCount === 0) return
    throw new EventServiceError(
      409,
      'MATCH_TYPE_LOCKED',
      `This category already has ${entrantCount} ${
        entrantCount === 1 ? 'entry' : 'entries'
      }, so it can no longer be switched between singles and doubles. Create a separate ` +
        'category instead.'
    )
  }

  async function createCategory(
    actingPlayerId: string,
    tournamentId: string,
    input: CreateTournamentCategoryInput
  ) {
    const tournament = await assertTournamentOrganizer(actingPlayerId, tournamentId)
    assertValidCapacity(input.max_participants)
    assertValidMatchType(input.match_type)
    assertValidFormat(input.format)
    // Written down rather than left null: the tournament's values are only
    // defaults at the moment of creation, and a category should keep saying what
    // it is even if the tournament's own type or format is later changed.
    const record = await categories.create({
      ...input,
      match_type: input.match_type ?? tournament.match_type,
      format: input.format ?? tournament.format
    })
    return toTournamentCategoryDto(record)
  }

  return {
    async updateCategory(actingPlayerId, categoryId, input) {
      const category = await categories.findById(categoryId)
      if (!category) {
        throw new EventServiceError(404, 'NOT_FOUND', 'Category not found.')
      }
      await assertTournamentOrganizer(actingPlayerId, category.tournament_id)

      assertValidMatchType(input.match_type)
      assertValidFormat(input.format)

      // Both remaining guards count this category's registrations, so the rows
      // are fetched once and each guard reads the count it cares about.
      const changesMatchType =
        input.match_type !== undefined &&
        input.match_type !== null &&
        input.match_type !== category.match_type
      const changesCapacity =
        input.max_participants !== undefined && input.max_participants !== null

      if (changesCapacity) assertValidCapacity(input.max_participants)

      if (changesCapacity || changesMatchType) {
        if (!registrations) {
          throw new EventServiceError(
            500,
            'INTERNAL_ERROR',
            'Cannot verify capacity without the registration repository.'
          )
        }
        const inCategory = (await registrations.findByTournamentId(category.tournament_id)).filter(
          (r) => r.category_id === categoryId
        )

        if (changesCapacity) {
          const confirmed = inCategory.filter((r) => r.status === 'confirmed').length
          assertCapacityFitsConfirmed(input.max_participants!, confirmed)
        }

        // Withdrawn and rejected entries hold nothing, so they do not lock the
        // category.
        const live = inCategory.filter(
          (r) => r.status !== 'withdrawn' && r.status !== 'rejected'
        ).length
        assertMatchTypeChangeIsSafe(category.match_type, input.match_type, live)
      }

      // Completing publishes the final standings, so it waits until there are
      // final standings to publish. This was previously available at any time,
      // which meant the commonest misclick on the card published a half-played
      // table as the result of the category. An abandoned category is trashed
      // instead — `deleteCategory` — which says what actually happened.
      if (input.status === 'completed' && category.status !== 'completed') {
        const undecided = await categories.countUndecidedMatches(categoryId)
        if (undecided > 0) {
          throw new EventServiceError(
            409,
            'CATEGORY_NOT_DECIDED',
            `${undecided} ${undecided === 1 ? 'match has' : 'matches have'} no result yet. Record them, or trash this category if it is not being played.`
          )
        }
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
        display_order: input.display_order,
        match_type: input.match_type,
        format: input.format
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
        display_order: input.display_order,
        match_type: input.match_type,
        format: input.format
      })
    },

    async listForTournament(tournamentId) {
      const records = await categories.findByTournamentId(tournamentId)
      return records.map(toTournamentCategoryDto)
    },

    async listTemplates() {
      const records = await categories.listTemplates()
      return records.map(toTournamentCategoryTemplateDto)
    },

    async deleteCategory(actingPlayerId, categoryId) {
      const category = await categories.findById(categoryId)
      if (!category) {
        throw new EventServiceError(404, 'NOT_FOUND', 'Category not found.')
      }
      await assertTournamentOrganizer(actingPlayerId, category.tournament_id)

      // A played category is a record of something that happened, and the
      // matches behind those results carry ratings. Closing one is `completed`,
      // which keeps the standings; deleting it would destroy the evidence for
      // rating changes that have already been applied to people's profiles.
      const played = await categories.countRecordedResults(categoryId)
      if (played > 0) {
        throw new EventServiceError(
          409,
          'CATEGORY_HAS_RESULTS',
          `This category has ${played} recorded ${played === 1 ? 'result' : 'results'} and cannot be removed. Mark it complete instead.`
        )
      }

      await categories.deleteWithChildren(categoryId)
    }
  }
}
