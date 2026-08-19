import { beforeEach, describe, expect, it } from 'vitest'
import { createTournamentCategoryService } from '../../server/domains/event/services/tournament-category.service'
import type { TournamentCategoryRepository } from '../../server/domains/event/repositories/tournament-category.repository'
import type { TournamentRepository } from '../../server/domains/event/repositories/tournament.repository'
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
      }
    }
  })

  function createService() {
    return createTournamentCategoryService(categoryRepository, tournamentRepository, eventRepository)
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
})
