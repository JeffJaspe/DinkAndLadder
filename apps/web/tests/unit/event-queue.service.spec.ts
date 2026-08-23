import { describe, it, expect, vi } from 'vitest'
import {
  createEventQueueService
} from '../../server/domains/event/services/event-queue.service'
import type { EventQueueRepository } from '../../server/domains/event/repositories/event-queue.repository'
import type { EventRegistrationRepository } from '../../server/domains/event/repositories/event-registration.repository'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type { EventQueueRecord, EventRecord, EventRegistrationRecord } from '../../server/domains/event/dto/event.dto'

function makeQueueEntry(overrides?: Partial<EventQueueRecord>): EventQueueRecord {
  return {
    id: 'queue-1',
    event_id: 'event-1',
    player_id: 'player-1',
    match_type: 'singles',
    partner_id: null,
    joined_at: '2026-08-01T00:00:00Z',
    status: 'waiting',
    matched_at: null,
    court_number: null,
    match_id: null,
    opponent_queue_id: null,
    ...overrides
  }
}

function makeEventRecord(overrides?: Partial<EventRecord>): EventRecord {
  return {
    id: 'event-1',
    club_id: 'club-1',
    name: 'Test Event',
    description: null,
    venue: null,
    province: null,
    city: null,
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    registration_opens: null,
    registration_closes: null,
    status: 'active',
    visibility: 'public',
    event_type: 'open_ranked',
    fee_amount: null,
    fee_currency: null,
    max_participants: null,
    queue_enabled: true,
    queue_courts: 4,
    queue_mode: 'first_come',
    queue_skip_timeout_seconds: 120,
    created_by_player_id: 'organizer-1',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides
  }
}

function makeRegistration(overrides?: Partial<EventRegistrationRecord>): EventRegistrationRecord {
  return {
    id: 'registration-1',
    event_id: 'event-1',
    player_id: 'player-1',
    status: 'registered',
    registered_at: '2026-08-01T00:00:00Z',
    checked_in_at: null,
    withdrawn_at: null,
    ...overrides
  }
}

function createFakeQueueRepository(overrides?: Partial<EventQueueRepository>): EventQueueRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByEventAndPlayer: vi.fn().mockResolvedValue(null),
    findWaiting: vi.fn().mockResolvedValue([]),
    findByEvent: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    updateStatus: vi.fn(),
    setMatched: vi.fn(),
    setPlaying: vi.fn(),
    leave: vi.fn(),
    ...overrides
  }
}

function createFakeRegistrationRepository(
  overrides?: Partial<EventRegistrationRepository>
): EventRegistrationRepository {
  return {
    findByEventAndPlayer: vi.fn().mockResolvedValue(makeRegistration()),
    findByEvent: vi.fn().mockResolvedValue([]),
    findByPlayer: vi.fn().mockResolvedValue([]),
    countByEvent: vi.fn().mockResolvedValue(0),
    countByEvents: vi.fn().mockResolvedValue(new Map<string, number>()),
    create: vi.fn(),
    updateStatus: vi.fn(),
    checkIn: vi.fn(),
    withdraw: vi.fn(),
    ...overrides
  }
}

function createFakeEventRepository(overrides?: Partial<EventRepository>): EventRepository {
  return {
    findById: vi.fn().mockResolvedValue(makeEventRecord()),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    // Added to EventRepository alongside cascade delete; the fakes were never
    // updated, which broke `vue-tsc` for every spec that builds one.
    countBlockingChildren: vi.fn().mockResolvedValue({ registrations: 0, matches: 0, queueEntries: 0 }),
    deleteWithChildren: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

describe('EventQueueService', () => {
  describe('joinQueue', () => {
    it('creates a singles queue entry for a registered player', async () => {
      const queueRepo = createFakeQueueRepository({ create: vi.fn().mockResolvedValue(makeQueueEntry()) })
      const service = createEventQueueService(
        queueRepo,
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      const entry = await service.joinQueue('event-1', 'player-1', 'singles')

      expect(entry.status).toBe('waiting')
      expect(queueRepo.create).toHaveBeenCalledWith({
        event_id: 'event-1',
        player_id: 'player-1',
        match_type: 'singles',
        partner_id: null
      })
    })

    it('rejects joining if the player is not registered', async () => {
      const service = createEventQueueService(
        createFakeQueueRepository(),
        createFakeRegistrationRepository({ findByEventAndPlayer: vi.fn().mockResolvedValue(null) }),
        createFakeEventRepository()
      )

      await expect(service.joinQueue('event-1', 'player-1', 'singles')).rejects.toMatchObject({
        code: 'NOT_REGISTERED'
      })
    })

    it('rejects joining twice', async () => {
      const service = createEventQueueService(
        createFakeQueueRepository({ findByEventAndPlayer: vi.fn().mockResolvedValue(makeQueueEntry()) }),
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      await expect(service.joinQueue('event-1', 'player-1', 'singles')).rejects.toMatchObject({
        code: 'ALREADY_QUEUED'
      })
    })

    it('requires a partner for doubles', async () => {
      const service = createEventQueueService(
        createFakeQueueRepository(),
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      await expect(service.joinQueue('event-1', 'player-1', 'doubles')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR'
      })
    })

    it('rejects a partner who is not registered', async () => {
      const registrationRepo = createFakeRegistrationRepository({
        findByEventAndPlayer: vi
          .fn()
          .mockResolvedValueOnce(makeRegistration())
          .mockResolvedValueOnce(null)
      })
      const service = createEventQueueService(
        createFakeQueueRepository(),
        registrationRepo,
        createFakeEventRepository()
      )

      await expect(
        service.joinQueue('event-1', 'player-1', 'doubles', 'player-2')
      ).rejects.toMatchObject({ code: 'NOT_REGISTERED' })
    })
  })

  describe('leaveQueue', () => {
    it('leaves the queue when an entry exists', async () => {
      const queueRepo = createFakeQueueRepository({
        findByEventAndPlayer: vi.fn().mockResolvedValue(makeQueueEntry())
      })
      const service = createEventQueueService(
        queueRepo,
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      await service.leaveQueue('event-1', 'player-1')

      expect(queueRepo.leave).toHaveBeenCalledWith('queue-1')
    })

    it('rejects leaving when there is no entry', async () => {
      const service = createEventQueueService(
        createFakeQueueRepository(),
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      await expect(service.leaveQueue('event-1', 'player-1')).rejects.toMatchObject({
        code: 'NOT_QUEUED'
      })
    })
  })

  describe('matchEntries', () => {
    it('matches two waiting entries onto a court', async () => {
      const entry1 = makeQueueEntry({ id: 'queue-1', player_id: 'player-1' })
      const entry2 = makeQueueEntry({ id: 'queue-2', player_id: 'player-2' })
      const queueRepo = createFakeQueueRepository({
        findById: vi.fn().mockImplementation((id: string) =>
          Promise.resolve(id === 'queue-1' ? entry1 : id === 'queue-2' ? entry2 : null)
        ),
        findByEvent: vi.fn().mockResolvedValue([entry1, entry2]),
        setMatched: vi.fn().mockImplementation((id: string, courtNumber: number, opponentId: string) =>
          Promise.resolve({ ...(id === 'queue-1' ? entry1 : entry2), status: 'matched', court_number: courtNumber, opponent_queue_id: opponentId })
        )
      })
      const service = createEventQueueService(
        queueRepo,
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      const result = await service.matchEntries('organizer-1', 'event-1', 'queue-1', 'queue-2', 3)

      expect(result.first.status).toBe('matched')
      expect(result.first.court_number).toBe(3)
      expect(result.second.court_number).toBe(3)
    })

    it('rejects matching when the acting player is not the organizer', async () => {
      const service = createEventQueueService(
        createFakeQueueRepository(),
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      await expect(
        service.matchEntries('someone-else', 'event-1', 'queue-1', 'queue-2', 1)
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('rejects matching the same entry to itself', async () => {
      const service = createEventQueueService(
        createFakeQueueRepository(),
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      await expect(
        service.matchEntries('organizer-1', 'event-1', 'queue-1', 'queue-1', 1)
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    })

    it('rejects matching when an entry is not waiting', async () => {
      const entry1 = makeQueueEntry({ id: 'queue-1', status: 'matched' })
      const entry2 = makeQueueEntry({ id: 'queue-2' })
      const queueRepo = createFakeQueueRepository({
        findById: vi.fn().mockImplementation((id: string) =>
          Promise.resolve(id === 'queue-1' ? entry1 : entry2)
        )
      })
      const service = createEventQueueService(
        queueRepo,
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      await expect(
        service.matchEntries('organizer-1', 'event-1', 'queue-1', 'queue-2', 1)
      ).rejects.toMatchObject({ code: 'INVALID_QUEUE_STATE' })
    })

    it('rejects matching onto a court already in use', async () => {
      const entry1 = makeQueueEntry({ id: 'queue-1' })
      const entry2 = makeQueueEntry({ id: 'queue-2' })
      const busy = makeQueueEntry({ id: 'queue-3', status: 'matched', court_number: 2 })
      const queueRepo = createFakeQueueRepository({
        findById: vi.fn().mockImplementation((id: string) =>
          Promise.resolve(id === 'queue-1' ? entry1 : entry2)
        ),
        findByEvent: vi.fn().mockResolvedValue([entry1, entry2, busy])
      })
      const service = createEventQueueService(
        queueRepo,
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      await expect(
        service.matchEntries('organizer-1', 'event-1', 'queue-1', 'queue-2', 2)
      ).rejects.toMatchObject({ code: 'COURT_IN_USE' })
    })
  })

  describe('skipEntry', () => {
    it('skips a waiting entry', async () => {
      const entry = makeQueueEntry()
      const queueRepo = createFakeQueueRepository({
        findById: vi.fn().mockResolvedValue(entry),
        updateStatus: vi.fn().mockResolvedValue({ ...entry, status: 'skipped' })
      })
      const service = createEventQueueService(
        queueRepo,
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      const updated = await service.skipEntry('organizer-1', 'event-1', 'queue-1')

      expect(updated.status).toBe('skipped')
    })

    it('rejects skipping when the acting player is not the organizer', async () => {
      const service = createEventQueueService(
        createFakeQueueRepository({ findById: vi.fn().mockResolvedValue(makeQueueEntry()) }),
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      await expect(
        service.skipEntry('someone-else', 'event-1', 'queue-1')
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('rejects skipping a non-waiting entry', async () => {
      const entry = makeQueueEntry({ status: 'matched' })
      const service = createEventQueueService(
        createFakeQueueRepository({ findById: vi.fn().mockResolvedValue(entry) }),
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      await expect(
        service.skipEntry('organizer-1', 'event-1', 'queue-1')
      ).rejects.toMatchObject({ code: 'INVALID_QUEUE_STATE' })
    })
  })
})
