import { describe, it, expect, vi } from 'vitest'
import {
  createEventService,
  EventServiceError
} from '../../server/domains/event/services/event.service'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type {
  TournamentRepository,
  TournamentRegistrationRepository
} from '../../server/domains/event/repositories/tournament.repository'
import type { ClubMembershipRepository } from '../../server/domains/club/repositories/club-membership.repository'
import type { EventRecord } from '../../server/domains/event/dto/event.dto'
import type {
  TournamentRecord,
  TournamentRegistrationRecord
} from '../../server/domains/event/dto/tournament.dto'

function createFakeEventRepository(overrides?: Partial<EventRepository>): EventRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    // Added to EventRepository alongside cascade delete; the fakes were never
    // updated, which broke `vue-tsc` for every spec that builds one.
    countBlockingChildren: vi
      .fn()
      .mockResolvedValue({ registrations: 0, matches: 0, queueEntries: 0 }),
    deleteWithChildren: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

function createFakeTournamentRepository(
  overrides?: Partial<TournamentRepository>
): TournamentRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByEventId: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    ...overrides
  }
}

function createFakeRegistrationRepository(
  overrides?: Partial<TournamentRegistrationRepository>
): TournamentRegistrationRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByTournamentAndPlayer: vi.fn().mockResolvedValue(null),
    findByTournamentId: vi.fn().mockResolvedValue([]),
    findByTournamentIdWithPlayers: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    updateStatus: vi.fn(),
    countByTournament: vi.fn().mockResolvedValue(0),
    ...overrides
  }
}

function createFakeMembershipRepository(
  overrides?: Partial<ClubMembershipRepository>
): ClubMembershipRepository {
  return {
    findByClubAndPlayer: vi.fn().mockResolvedValue({
      id: 'membership-1',
      club_id: 'club-1',
      player_id: 'player-1',
      role: 'OWNER',
      status: 'active',
      joined_at: '2026-01-01T00:00:00Z',
      left_at: null,
      created_at: '2026-01-01T00:00:00Z'
    }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    updateById: vi.fn(),
    listByClub: vi.fn().mockResolvedValue([]),
    listOwnWithClub: vi.fn().mockResolvedValue([]),
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
    created_by_player_id: 'player-1',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides
  }
}

function makeTournamentRecord(overrides?: Partial<TournamentRecord>): TournamentRecord {
  return {
    id: 'tournament-1',
    event_id: 'event-1',
    name: 'Singles Open',
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

function makeRegistrationRecord(
  overrides?: Partial<TournamentRegistrationRecord>
): TournamentRegistrationRecord {
  return {
    id: 'registration-1',
    tournament_id: 'tournament-1',
    player_id: 'player-1',
    partner_player_id: null,
    status: 'pending',
    registered_at: '2026-08-01T00:00:00Z',
    confirmed_at: null,
    created_at: '2026-08-01T00:00:00Z',
    category_id: null,
    ...overrides
  }
}

describe('EventService', () => {
  describe('createEvent', () => {
    it('creates an event and returns DTO', async () => {
      const event = makeEventRecord()
      const eventRepo = createFakeEventRepository({
        create: vi.fn().mockResolvedValue(event)
      })
      const service = createEventService(
        eventRepo,
        createFakeTournamentRepository(),
        createFakeRegistrationRepository(),
        createFakeMembershipRepository()
      )

      const result = await service.createEvent('player-1', {
        club_id: 'club-1',
        name: 'Test Event',
        start_date: '2026-09-01',
        end_date: '2026-09-02',
        event_type: 'open_ranked'
      })

      expect(result.id).toBe('event-1')
      expect(result.name).toBe('Test Event')
    })

    it('rejects non-admin creating event', async () => {
      const eventRepo = createFakeEventRepository()
      const membershipRepo = createFakeMembershipRepository({
        findByClubAndPlayer: vi.fn().mockResolvedValue({
          id: 'membership-1',
          club_id: 'club-1',
          player_id: 'player-1',
          role: 'MEMBER',
          status: 'active',
          joined_at: '2026-01-01T00:00:00Z',
          left_at: null,
          created_at: '2026-01-01T00:00:00Z'
        })
      })
      const service = createEventService(
        eventRepo,
        createFakeTournamentRepository(),
        createFakeRegistrationRepository(),
        membershipRepo
      )

      await expect(
        service.createEvent('player-1', {
          club_id: 'club-1',
          name: 'Test Event',
          start_date: '2026-09-01',
          end_date: '2026-09-02',
          event_type: 'open_ranked'
        })
      ).rejects.toThrow(EventServiceError)
    })

    it('rejects non-member creating event', async () => {
      const eventRepo = createFakeEventRepository()
      const membershipRepo = createFakeMembershipRepository({
        findByClubAndPlayer: vi.fn().mockResolvedValue(null)
      })
      const service = createEventService(
        eventRepo,
        createFakeTournamentRepository(),
        createFakeRegistrationRepository(),
        membershipRepo
      )

      await expect(
        service.createEvent('player-1', {
          club_id: 'club-1',
          name: 'Test Event',
          start_date: '2026-09-01',
          end_date: '2026-09-02',
          event_type: 'open_ranked'
        })
      ).rejects.toThrow(EventServiceError)
    })
  })

  describe('getEvent', () => {
    it('returns event when found', async () => {
      const event = makeEventRecord()
      const eventRepo = createFakeEventRepository({
        findById: vi.fn().mockResolvedValue(event)
      })
      const service = createEventService(
        eventRepo,
        createFakeTournamentRepository(),
        createFakeRegistrationRepository()
      )

      const result = await service.getEvent('event-1')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('event-1')
    })

    it('returns null when not found', async () => {
      const eventRepo = createFakeEventRepository()
      const service = createEventService(
        eventRepo,
        createFakeTournamentRepository(),
        createFakeRegistrationRepository()
      )

      const result = await service.getEvent('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('publishEvent', () => {
    it('publishes a draft event', async () => {
      const event = makeEventRecord({ status: 'draft' })
      const publishedEvent = makeEventRecord({ status: 'published' })
      const eventRepo = createFakeEventRepository({
        findById: vi.fn().mockResolvedValue(event),
        updateStatus: vi.fn().mockResolvedValue(publishedEvent)
      })
      const service = createEventService(
        eventRepo,
        createFakeTournamentRepository(),
        createFakeRegistrationRepository()
      )

      const result = await service.publishEvent('player-1', 'event-1')
      expect(result.status).toBe('published')
    })

    it('throws when not the organizer', async () => {
      const event = makeEventRecord({ created_by_player_id: 'other-player' })
      const eventRepo = createFakeEventRepository({
        findById: vi.fn().mockResolvedValue(event)
      })
      const service = createEventService(
        eventRepo,
        createFakeTournamentRepository(),
        createFakeRegistrationRepository()
      )

      await expect(service.publishEvent('player-1', 'event-1')).rejects.toThrow(EventServiceError)
    })

    it('throws when event is already published', async () => {
      const event = makeEventRecord({ status: 'published' })
      const eventRepo = createFakeEventRepository({
        findById: vi.fn().mockResolvedValue(event)
      })
      const service = createEventService(
        eventRepo,
        createFakeTournamentRepository(),
        createFakeRegistrationRepository()
      )

      await expect(service.publishEvent('player-1', 'event-1')).rejects.toThrow(EventServiceError)
    })
  })

  describe('register', () => {
    it('registers a player for a tournament', async () => {
      const tournament = makeTournamentRecord({ status: 'open' })
      const registration = makeRegistrationRecord()
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const registrationRepo = createFakeRegistrationRepository({
        create: vi.fn().mockResolvedValue(registration)
      })
      const service = createEventService(
        createFakeEventRepository(),
        tournamentRepo,
        registrationRepo
      )

      const result = await service.register('player-1', 'tournament-1', null)
      expect(result.tournament_id).toBe('tournament-1')
      expect(result.player_id).toBe('player-1')
    })

    it('throws when tournament registration is not open', async () => {
      const tournament = makeTournamentRecord({ status: 'in_progress' })
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const service = createEventService(
        createFakeEventRepository(),
        tournamentRepo,
        createFakeRegistrationRepository()
      )

      await expect(service.register('player-1', 'tournament-1', null)).rejects.toThrow(
        EventServiceError
      )
    })

    it('throws when already registered', async () => {
      const tournament = makeTournamentRecord({ status: 'open' })
      const existing = makeRegistrationRecord()
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const registrationRepo = createFakeRegistrationRepository({
        findByTournamentAndPlayer: vi.fn().mockResolvedValue(existing)
      })
      const service = createEventService(
        createFakeEventRepository(),
        tournamentRepo,
        registrationRepo
      )

      await expect(service.register('player-1', 'tournament-1', null)).rejects.toThrow(
        EventServiceError
      )
    })

    it('throws when doubles tournament has no partner', async () => {
      const tournament = makeTournamentRecord({ status: 'open', match_type: 'doubles' })
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const service = createEventService(
        createFakeEventRepository(),
        tournamentRepo,
        createFakeRegistrationRepository()
      )

      await expect(service.register('player-1', 'tournament-1', null)).rejects.toThrow(
        EventServiceError
      )
    })

    it('throws when tournament is full', async () => {
      const tournament = makeTournamentRecord({ status: 'open', max_participants: 8 })
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const registrationRepo = createFakeRegistrationRepository({
        countByTournament: vi.fn().mockResolvedValue(8)
      })
      const service = createEventService(
        createFakeEventRepository(),
        tournamentRepo,
        registrationRepo
      )

      await expect(service.register('player-1', 'tournament-1', null)).rejects.toThrow(
        EventServiceError
      )
    })
  })

  describe('withdrawRegistration', () => {
    it('withdraws a registration', async () => {
      const registration = makeRegistrationRecord()
      const withdrawn = makeRegistrationRecord({ status: 'withdrawn' })
      const registrationRepo = createFakeRegistrationRepository({
        findById: vi.fn().mockResolvedValue(registration),
        updateStatus: vi.fn().mockResolvedValue(withdrawn)
      })
      const service = createEventService(
        createFakeEventRepository(),
        createFakeTournamentRepository(),
        registrationRepo
      )

      const result = await service.withdrawRegistration('player-1', 'registration-1')
      expect(result.status).toBe('withdrawn')
    })

    it('throws when not the registrant', async () => {
      const registration = makeRegistrationRecord({ player_id: 'other-player' })
      const registrationRepo = createFakeRegistrationRepository({
        findById: vi.fn().mockResolvedValue(registration)
      })
      const service = createEventService(
        createFakeEventRepository(),
        createFakeTournamentRepository(),
        registrationRepo
      )

      await expect(service.withdrawRegistration('player-1', 'registration-1')).rejects.toThrow(
        EventServiceError
      )
    })
  })
})
