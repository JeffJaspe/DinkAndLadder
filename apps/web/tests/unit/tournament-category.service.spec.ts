import { beforeEach, describe, expect, it } from 'vitest'
import { createTournamentCategoryService } from '../../server/domains/event/services/tournament-category.service'
import type { TournamentCategoryRepository } from '../../server/domains/event/repositories/tournament-category.repository'
import type {
  TournamentRegistrationRepository,
  TournamentRepository
} from '../../server/domains/event/repositories/tournament.repository'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type {
  TournamentCategoryRecord,
  TournamentCategoryTemplateRecord
} from '../../server/domains/event/dto/tournament-category.dto'
import type { TournamentRecord } from '../../server/domains/event/dto/tournament.dto'
import type { EventRecord } from '../../server/domains/event/dto/event.dto'

const TEMPLATES: TournamentCategoryTemplateRecord[] = [
  { id: 'tpl-novice', name: 'Novice', min_rating: null, max_rating: 2.5, display_order: 1 },
  { id: 'tpl-open', name: 'Open', min_rating: null, max_rating: null, display_order: 7 }
]

function makeTournament(overrides?: Partial<TournamentRecord>): TournamentRecord {
  return {
    id: 'tournament-1',
    event_id: 'event-1',
    name: 'Test Tournament',
    format: 'single_elimination',
    match_type: 'singles',
    min_rating: null,
    max_rating: null,
    max_participants: null,
    status: 'draft',
    bracket_locked_at: null,
    bracket_locked_by_player_id: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides
  }
}

function makeEvent(overrides?: Partial<EventRecord>): EventRecord {
  return {
    id: 'event-1',
    club_id: null,
    name: 'Test Event',
    description: null,
    venue: null,
    province: null,
    city: null,
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    registration_opens: null,
    registration_closes: null,
    status: 'draft',
    visibility: 'public',
    event_type: 'open_ranked',
    fee_amount: null,
    fee_currency: null,
    max_participants: null,
    queue_enabled: false,
    queue_courts: 1,
    queue_mode: 'first_come',
    queue_skip_timeout_seconds: 120,
    created_by_player_id: 'player-organizer',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides
  } as EventRecord
}

describe('TournamentCategoryService', () => {
  let created: TournamentCategoryRecord[]
  let categoryRepository: TournamentCategoryRepository
  let tournamentRepository: TournamentRepository
  let eventRepository: EventRepository
  /** Bracket state the category service reads but does not own. */
  let recordedResults: number
  let undecidedMatches: number
  let deleted: string[]

  beforeEach(() => {
    created = []
    recordedResults = 0
    undecidedMatches = 0
    deleted = []

    categoryRepository = {
      async findById(id) {
        return created.find((c) => c.id === id) ?? null
      },
      async findByTournamentId(tournamentId) {
        return created.filter((c) => c.tournament_id === tournamentId)
      },
      async create(input) {
        const record: TournamentCategoryRecord = {
          id: `category-${created.length + 1}`,
          tournament_id: input.tournament_id,
          template_id: input.template_id ?? null,
          name: input.name,
          category_type: input.category_type,
          min_rating: input.min_rating ?? null,
          max_rating: input.max_rating ?? null,
          max_participants: input.max_participants ?? null,
          display_order: input.display_order ?? 0,
          match_type: input.match_type ?? null,
          format: input.format ?? null,
          status: 'open',
          bracket_locked_at: null,
          bracket_locked_by_player_id: null,
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-01T00:00:00Z'
        }
        created.push(record)
        return record
      },
      async update(categoryId, input) {
        const existing = created.find((c) => c.id === categoryId)
        if (!existing) throw new Error(`no such category: ${categoryId}`)
        // Mirror the repository: only overwrite keys that were supplied.
        if (input.name !== undefined) existing.name = input.name
        if (input.min_rating !== undefined) existing.min_rating = input.min_rating
        if (input.max_rating !== undefined) existing.max_rating = input.max_rating
        if (input.max_participants !== undefined) existing.max_participants = input.max_participants
        if (input.display_order !== undefined) existing.display_order = input.display_order
        if (input.status !== undefined) existing.status = input.status
        if (input.match_type !== undefined) existing.match_type = input.match_type
        if (input.format !== undefined) existing.format = input.format
        return existing
      },
      async listTemplates() {
        return TEMPLATES
      },
      // Overridden per-test where the count is what is under test. Defaults say
      // "nothing played, nothing outstanding", which is a brand-new category.
      async countRecordedResults() {
        return recordedResults
      },
      async countUndecidedMatches() {
        return undecidedMatches
      },
      async setBracketLock(categoryId) {
        const c = created.find((x) => x.id === categoryId)
        if (!c) throw new Error(`no such category: ${categoryId}`)
        return c
      },
      async deleteWithChildren(categoryId) {
        deleted.push(categoryId)
        created = created.filter((c) => c.id !== categoryId)
      }
    }

    tournamentRepository = {
      async findById() {
        return makeTournament()
      },
      async findByEventId() {
        return []
      },
      async create() {
        throw new Error('not used')
      },
      async update() {
        throw new Error('not used')
      },
      async updateStatus() {
        throw new Error('not used')
      },
      async setBracketLock() {
        throw new Error('not used')
      }
    }

    eventRepository = {
      async findById() {
        return makeEvent()
      },
      async create() {
        throw new Error('not used')
      },
      async update() {
        throw new Error('not used')
      },
      async updateStatus() {
        throw new Error('not used')
      },
      async search() {
        return []
      },
      // Added to EventRepository alongside cascade delete; this fake was never
      // updated, which broke `vue-tsc` for this spec.
      async countBlockingChildren() {
        return { registrations: 0, matches: 0, queueEntries: 0 }
      },
      async deleteWithChildren() {
        throw new Error('not used')
      },
      async countByClubForLimits() {
        return { drafts: 0, liveTournaments: 0, liveOpenPlay: 0 }
      }
    }
  })

  function createService() {
    return createTournamentCategoryService(
      categoryRepository,
      tournamentRepository,
      eventRepository
    )
  }

  /**
   * updateCategory needs a registration repository to check a capacity change
   * against the confirmed count; `confirmed` seeds how many are already in.
   */
  function createServiceWithRegistrations(confirmed: number, categoryId: string) {
    const rows = Array.from({ length: confirmed }, (_, i) => ({
      id: `reg-${i + 1}`,
      tournament_id: 'tournament-1',
      player_id: `player-${i + 1}`,
      partner_player_id: null,
      status: 'confirmed' as const,
      registered_at: '2026-08-01T00:00:00Z',
      confirmed_at: '2026-08-01T00:00:00Z',
      created_at: '2026-08-01T00:00:00Z',
      category_id: categoryId
    }))

    const registrations = {
      findById: async () => null,
      findCategoryEntrants: async () => [],
      findByTournamentId: async () => rows,
      findByTournamentIdWithPlayers: async () => [],
      create: async () => {
        throw new Error('not used')
      },
      updateStatus: async () => {
        throw new Error('not used')
      },
      countByTournament: async () => rows.length
    } as unknown as TournamentRegistrationRepository

    return createTournamentCategoryService(
      categoryRepository,
      tournamentRepository,
      eventRepository,
      registrations
    )
  }

  it('lets the event organizer create a category from a template', async () => {
    const service = createService()
    const result = await service.createFromTemplate('player-organizer', 'tournament-1', {
      template_id: 'tpl-novice'
    })
    expect(result.name).toBe('Novice')
    expect(result.category_type).toBe('predefined')
    expect(result.max_rating).toBe(2.5)
  })

  it('rejects creating from an unknown template', async () => {
    const service = createService()
    await expect(
      service.createFromTemplate('player-organizer', 'tournament-1', { template_id: 'nope' })
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('lets the event organizer create a custom category', async () => {
    const service = createService()
    const result = await service.createCustom('player-organizer', 'tournament-1', {
      name: 'Intermediate Plus',
      min_rating: 3.0,
      max_rating: 3.75
    })
    expect(result.category_type).toBe('custom')
    expect(result.min_rating).toBe(3.0)
  })

  it('rejects a non-organizer from creating a category', async () => {
    const service = createService()
    await expect(
      service.createCustom('someone-else', 'tournament-1', { name: 'Sneaky Category' })
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('lists categories for a tournament', async () => {
    const service = createService()
    await service.createCustom('player-organizer', 'tournament-1', { name: 'A' })
    await service.createCustom('player-organizer', 'tournament-1', { name: 'B' })
    const result = await service.listForTournament('tournament-1')
    expect(result).toHaveLength(2)
  })

  it('lists templates', async () => {
    const service = createService()
    const result = await service.listTemplates()
    expect(result.map((t) => t.name)).toEqual(['Novice', 'Open'])
  })
  describe('updateCategory', () => {
    it('renames a category for the organizer', async () => {
      const service = createService()
      const cat = await service.createCustom('player-organizer', 'tournament-1', { name: 'Old' })

      const updated = await createServiceWithRegistrations(0, cat.id).updateCategory(
        'player-organizer',
        cat.id,
        { name: 'New' }
      )

      expect(updated.name).toBe('New')
    })

    it('refuses a non-organizer', async () => {
      const service = createService()
      const cat = await service.createCustom('player-organizer', 'tournament-1', { name: 'Open' })

      await expect(
        createServiceWithRegistrations(0, cat.id).updateCategory('intruder', cat.id, {
          name: 'Mine'
        })
      ).rejects.toThrow(/Only the event organizer/)
    })

    it('rejects an unknown category', async () => {
      await expect(
        createServiceWithRegistrations(0, 'nope').updateCategory('player-organizer', 'nope', {
          name: 'X'
        })
      ).rejects.toThrow(/Category not found/)
    })

    it('refuses to shrink a category below its confirmed count', async () => {
      // Six players are already in; capping at four would imply taking two
      // places away from people who hold them.
      const service = createService()
      const cat = await service.createCustom('player-organizer', 'tournament-1', {
        name: 'Open',
        max_participants: 16
      })

      await expect(
        createServiceWithRegistrations(6, cat.id).updateCategory('player-organizer', cat.id, {
          max_participants: 4
        })
      ).rejects.toThrow(/already has 6 confirmed players/)
    })

    it('allows shrinking exactly to the confirmed count', async () => {
      const service = createService()
      const cat = await service.createCustom('player-organizer', 'tournament-1', {
        name: 'Open',
        max_participants: 16
      })

      const updated = await createServiceWithRegistrations(6, cat.id).updateCategory(
        'player-organizer',
        cat.id,
        { max_participants: 6 }
      )

      expect(updated.max_participants).toBe(6)
    })

    it.each([0, 1, 2.5, -4])('rejects %s as a player count', async (size) => {
      const service = createService()
      const cat = await service.createCustom('player-organizer', 'tournament-1', { name: 'Open' })

      await expect(
        createServiceWithRegistrations(0, cat.id).updateCategory('player-organizer', cat.id, {
          max_participants: size
        })
      ).rejects.toThrow(/whole number of at least 2/)
    })
  })

  /**
   * Singles or doubles used to live only on the tournament, so every category
   * of one weekend had to be the same. It is a property of the category now.
   */
  describe('match type', () => {
    it('writes the tournament type down when the caller gives none', async () => {
      const service = createService()

      const category = await service.createCustom('player-organizer', 'tournament-1', {
        name: 'Open'
      })

      // Recorded rather than left null, so the category keeps saying what it
      // is even if the tournament's own type is later changed.
      expect(category.match_type).toBe('singles')
    })

    it('keeps an explicit type that differs from the tournament', async () => {
      const service = createService()

      const category = await service.createCustom('player-organizer', 'tournament-1', {
        name: 'Doubles Open',
        match_type: 'doubles'
      })

      expect(category.match_type).toBe('doubles')
    })

    it('carries an explicit type through a template category too', async () => {
      const service = createService()

      const category = await service.createFromTemplate('player-organizer', 'tournament-1', {
        template_id: TEMPLATES[0].id,
        match_type: 'doubles'
      })

      expect(category.match_type).toBe('doubles')
    })

    it('rejects a type that is neither singles nor doubles', async () => {
      const service = createService()

      await expect(
        service.createCustom('player-organizer', 'tournament-1', {
          name: 'Mixed',
          match_type: 'mixed' as never
        })
      ).rejects.toMatchObject({ status: 400 })
    })
  })

  /**
   * Format moved onto the category in 031-tournament-format, on the same
   * "nullable means inherit" pattern match_type uses — so it is written down at
   * creation rather than left null, or a later change to the tournament's own
   * format would silently redraw categories nobody touched.
   */
  describe('per-category format', () => {
    it("writes the tournament's format down when none is given", async () => {
      const service = createService()

      const category = await service.createCustom('player-organizer', 'tournament-1', {
        name: 'Open'
      })

      expect(category.format).toBe('single_elimination')
    })

    it('keeps an explicit format that differs from the tournament', async () => {
      const service = createService()

      const category = await service.createCustom('player-organizer', 'tournament-1', {
        name: 'Open',
        format: 'round_robin'
      })

      expect(category.format).toBe('round_robin')
    })

    it('carries an explicit format through a template category too', async () => {
      const service = createService()

      const category = await service.createFromTemplate('player-organizer', 'tournament-1', {
        template_id: TEMPLATES[0].id,
        format: 'round_robin_double_elimination'
      })

      expect(category.format).toBe('round_robin_double_elimination')
    })

    it('rejects a format that is not on the list', async () => {
      const service = createService()

      await expect(
        service.createCustom('player-organizer', 'tournament-1', {
          name: 'Swiss thing',
          format: 'swiss' as never
        })
      ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
    })

    // The value the rename replaced. Accepting it would write a string the
    // database CHECK constraint refuses.
    it('rejects the retired pool_play value', async () => {
      const service = createService()

      await expect(
        service.createCustom('player-organizer', 'tournament-1', {
          name: 'Pools',
          format: 'pool_play' as never
        })
      ).rejects.toMatchObject({ status: 400 })
    })

    it('lets an organizer change the format of an existing category', async () => {
      const service = createService()
      const created = await service.createCustom('player-organizer', 'tournament-1', {
        name: 'Open'
      })

      const updated = await service.updateCategory('player-organizer', created.id, {
        format: 'round_robin_single_elimination'
      })

      expect(updated.format).toBe('round_robin_single_elimination')
    })
  })

  /**
   * Every doubles entry carries a partner. Flipping the category to singles
   * would orphan it, and flipping to doubles would leave singles entries in a
   * category that now demands one.
   */
  describe('locking match type once people have entered', () => {
    it('refuses to switch a category that already has entries', async () => {
      const seed = createService()
      const created = await seed.createCustom('player-organizer', 'tournament-1', {
        name: 'Open',
        match_type: 'doubles'
      })

      const service = createServiceWithRegistrations(2, created.id)

      await expect(
        service.updateCategory('player-organizer', created.id, { match_type: 'singles' })
      ).rejects.toMatchObject({ status: 409, code: 'MATCH_TYPE_LOCKED' })
    })

    it('allows the switch while nobody has entered', async () => {
      const seed = createService()
      const created = await seed.createCustom('player-organizer', 'tournament-1', {
        name: 'Open',
        match_type: 'doubles'
      })

      const service = createServiceWithRegistrations(0, created.id)
      const updated = await service.updateCategory('player-organizer', created.id, {
        match_type: 'singles'
      })

      expect(updated.match_type).toBe('singles')
    })

    // Resubmitting the form unchanged must not be refused as a "change".
    it('does not treat an unchanged match type as a switch', async () => {
      const seed = createService()
      const created = await seed.createCustom('player-organizer', 'tournament-1', {
        name: 'Open',
        match_type: 'doubles'
      })

      const service = createServiceWithRegistrations(3, created.id)
      const updated = await service.updateCategory('player-organizer', created.id, {
        match_type: 'doubles',
        name: 'Open Doubles'
      })

      expect(updated.name).toBe('Open Doubles')
    })

    // A format change redraws the bracket; it strands nobody's entry.
    it('lets the format change even with a full category', async () => {
      const seed = createService()
      const created = await seed.createCustom('player-organizer', 'tournament-1', {
        name: 'Open',
        match_type: 'doubles'
      })

      const service = createServiceWithRegistrations(4, created.id)
      const updated = await service.updateCategory('player-organizer', created.id, {
        format: 'round_robin'
      })

      expect(updated.format).toBe('round_robin')
    })
  })
  /**
   * The two ways a category ends. Finishing publishes standings and needs
   * results to publish; trashing destroys the category and is refused once
   * results exist, because at that point it is a record of something that
   * happened and its matches have already moved people's ratings.
   */
  describe('ending a category', () => {
    async function seedCategory() {
      const service = createService()
      return service.createCustom('player-organizer', 'tournament-1', { name: 'Open' })
    }

    it('refuses to complete while matches are undecided', async () => {
      const created = await seedCategory()
      undecidedMatches = 3

      await expect(
        createService().updateCategory('player-organizer', created.id, { status: 'completed' })
      ).rejects.toMatchObject({ code: 'CATEGORY_NOT_DECIDED' })
    })

    it('completes once every match has a result', async () => {
      const created = await seedCategory()
      undecidedMatches = 0

      const updated = await createService().updateCategory('player-organizer', created.id, {
        status: 'completed'
      })
      expect(updated.status).toBe('completed')
    })

    it('does not re-check an already completed category', async () => {
      const created = await seedCategory()
      undecidedMatches = 0
      await createService().updateCategory('player-organizer', created.id, { status: 'completed' })

      // A later edit must not be blocked by matches that appeared afterwards.
      undecidedMatches = 2
      const updated = await createService().updateCategory('player-organizer', created.id, {
        status: 'completed'
      })
      expect(updated.status).toBe('completed')
    })

    it('trashes a category nobody has played', async () => {
      const created = await seedCategory()
      recordedResults = 0

      await createService().deleteCategory('player-organizer', created.id)
      expect(deleted).toEqual([created.id])
    })

    it('refuses to trash a category with recorded results', async () => {
      const created = await seedCategory()
      recordedResults = 2

      await expect(
        createService().deleteCategory('player-organizer', created.id)
      ).rejects.toMatchObject({ code: 'CATEGORY_HAS_RESULTS' })
      expect(deleted).toEqual([])
    })

    it('refuses to trash for anyone but the organiser', async () => {
      const created = await seedCategory()

      await expect(
        createService().deleteCategory('someone-else', created.id)
      ).rejects.toMatchObject({ status: 403 })
      expect(deleted).toEqual([])
    })

    it('404s on a category that does not exist', async () => {
      await expect(
        createService().deleteCategory('player-organizer', 'nope')
      ).rejects.toMatchObject({ status: 404 })
    })
  })
})
