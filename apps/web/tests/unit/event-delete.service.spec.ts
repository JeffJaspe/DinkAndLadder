import { describe, expect, it, vi } from 'vitest'
import { createEventService, EventServiceError } from '../../server/domains/event/services/event.service'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type {
  TournamentRegistrationRepository,
  TournamentRepository
} from '../../server/domains/event/repositories/tournament.repository'
import type { EventRecord } from '../../server/domains/event/dto/event.dto'

function makeEvent(overrides?: Partial<EventRecord>): EventRecord {
  return {
    id: 'event-1',
    club_id: 'club-1',
    name: 'Draft Event',
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
    event_type: 'tournament',
    fee_amount: null,
    fee_currency: null,
    max_participants: null,
    queue_enabled: false,
    queue_courts: 1,
    queue_mode: 'first_come',
    queue_skip_timeout_seconds: 120,
    created_by_player_id: 'organizer-1',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides
  }
}

function setup(options?: {
  event?: EventRecord
  blocking?: { registrations: number; matches: number; queueEntries: number }
}) {
  const deleteWithChildren = vi.fn().mockResolvedValue(undefined)
  const events: EventRepository = {
    findById: vi.fn().mockResolvedValue(options?.event ?? makeEvent()),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    countBlockingChildren: vi
      .fn()
      .mockResolvedValue(
        options?.blocking ?? { registrations: 0, matches: 0, queueEntries: 0 }
      ),
    deleteWithChildren
  }

  const tournaments = {
    findById: vi.fn(),
    findByEventId: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn()
  } as unknown as TournamentRepository

  const registrations = {
    findById: vi.fn(),
    findByTournamentAndPlayer: vi.fn(),
    findByTournamentId: vi.fn().mockResolvedValue([]),
    findByTournamentIdWithPlayers: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    updateStatus: vi.fn(),
    countByTournament: vi.fn().mockResolvedValue(0)
  } as unknown as TournamentRegistrationRepository

  return {
    service: createEventService(events, tournaments, registrations),
    deleteWithChildren
  }
}

describe('EventService.deleteDraftEvent', () => {
  it('deletes a draft owned by the caller', async () => {
    const { service, deleteWithChildren } = setup()

    await service.deleteDraftEvent('organizer-1', 'event-1')

    expect(deleteWithChildren).toHaveBeenCalledWith('event-1')
  })

  it('refuses when the caller is not the organizer', async () => {
    const { service, deleteWithChildren } = setup()

    await expect(service.deleteDraftEvent('someone-else', 'event-1')).rejects.toThrow(
      EventServiceError
    )
    expect(deleteWithChildren).not.toHaveBeenCalled()
  })

  it.each(['published', 'active', 'completed', 'cancelled'] as const)(
    'refuses to delete a %s event — that is what cancelling is for',
    async (status) => {
      const { service, deleteWithChildren } = setup({ event: makeEvent({ status }) })

      await expect(service.deleteDraftEvent('organizer-1', 'event-1')).rejects.toThrow(
        /Only draft events can be deleted/
      )
      expect(deleteWithChildren).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['registrations', { registrations: 1, matches: 0, queueEntries: 0 }],
    ['matches', { registrations: 0, matches: 1, queueEntries: 0 }],
    ['queue entries', { registrations: 0, matches: 0, queueEntries: 1 }]
  ])('refuses a draft that still has %s attached', async (_label, blocking) => {
    // A draft should not have any of these. If it does, something real is
    // attached and destroying it silently would be wrong.
    const { service, deleteWithChildren } = setup({ blocking })

    await expect(service.deleteDraftEvent('organizer-1', 'event-1')).rejects.toThrow(
      /cannot be deleted/
    )
    expect(deleteWithChildren).not.toHaveBeenCalled()
  })

  it('reports a missing event as not found', async () => {
    const { service } = setup()
    const events = { findById: vi.fn().mockResolvedValue(null) }
    const bare = createEventService(
      events as unknown as EventRepository,
      {} as TournamentRepository,
      {} as TournamentRegistrationRepository
    )

    await expect(bare.deleteDraftEvent('organizer-1', 'missing')).rejects.toThrow(
      EventServiceError
    )
    expect(service).toBeDefined()
  })
})
