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

  beforeEach(() => {
    created = []

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
          status: 'open',
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
        return existing
      },
      async listTemplates() {
        return TEMPLATES
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
      findByTournamentAndPlayer: async () => null,
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
})
