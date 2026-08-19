import { describe, it, expect, vi } from 'vitest'
import { createBracketService, BracketServiceError } from '../../server/domains/event/services/bracket.service'
import type { BracketRepository } from '../../server/domains/event/repositories/bracket.repository'
import type {
  TournamentRepository,
  TournamentRegistrationRepository
} from '../../server/domains/event/repositories/tournament.repository'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type { BracketMatchRecord } from '../../server/domains/event/dto/bracket.dto'
import type { TournamentRecord, TournamentRegistrationRecord } from '../../server/domains/event/dto/tournament.dto'
import type { EventRecord } from '../../server/domains/event/dto/event.dto'

function createFakeBracketRepository(overrides?: Partial<BracketRepository>): BracketRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByTournamentId: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    deleteByTournamentId: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

function createFakeTournamentRepository(overrides?: Partial<TournamentRepository>): TournamentRepository {
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
    create: vi.fn(),
    updateStatus: vi.fn(),
    countByTournament: vi.fn().mockResolvedValue(0),
    ...overrides
  }
}

function createFakeEventRepository(overrides?: Partial<EventRepository>): EventRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
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
    status: 'published',
    visibility: 'public',
    event_type: 'tournament',
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
    status: 'open',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides
  }
}

function makeRegistrationRecord(
  id: string,
  playerId: string,
  overrides?: Partial<TournamentRegistrationRecord>
): TournamentRegistrationRecord {
  return {
    id,
    tournament_id: 'tournament-1',
    player_id: playerId,
    partner_player_id: null,
    status: 'confirmed',
    registered_at: '2026-08-01T00:00:00Z',
    confirmed_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    category_id: null,
    ...overrides
  }
}

function makeBracketMatchRecord(overrides?: Partial<BracketMatchRecord>): BracketMatchRecord {
  return {
    id: 'bracket-match-1',
    tournament_id: 'tournament-1',
    round: 1,
    position: 1,
    match_id: null,
    participant1_registration_id: 'reg-1',
    participant2_registration_id: 'reg-2',
    winner_registration_id: null,
    status: 'ready',
    scheduled_at: null,
    created_at: '2026-08-01T00:00:00Z',
    category_id: null,
    ...overrides
  }
}

describe('BracketService', () => {
  describe('getBracket', () => {
    it('returns bracket grouped by rounds', async () => {
      const tournament = makeTournamentRecord()
      const matches = [
        makeBracketMatchRecord({ id: 'bm-1', round: 1, position: 1 }),
        makeBracketMatchRecord({ id: 'bm-2', round: 1, position: 2 }),
        makeBracketMatchRecord({ id: 'bm-3', round: 2, position: 1 })
      ]

      const bracketRepo = createFakeBracketRepository({
        findByTournamentId: vi.fn().mockResolvedValue(matches)
      })
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })

      const service = createBracketService(
        bracketRepo,
        tournamentRepo,
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      const result = await service.getBracket('tournament-1')

      expect(result.tournament_id).toBe('tournament-1')
      expect(result.rounds).toHaveLength(2)
      expect(result.rounds[0].round).toBe(1)
      expect(result.rounds[0].matches).toHaveLength(2)
      expect(result.rounds[1].round).toBe(2)
      expect(result.rounds[1].matches).toHaveLength(1)
    })

    it('throws when tournament not found', async () => {
      const service = createBracketService(
        createFakeBracketRepository(),
        createFakeTournamentRepository(),
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      await expect(service.getBracket('nonexistent')).rejects.toThrow(BracketServiceError)
    })
  })

  describe('generateBracket', () => {
    it('generates single elimination bracket for 4 participants', async () => {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord({ status: 'open' })
      const registrations = [
        makeRegistrationRecord('reg-1', 'player-1'),
        makeRegistrationRecord('reg-2', 'player-2'),
        makeRegistrationRecord('reg-3', 'player-3'),
        makeRegistrationRecord('reg-4', 'player-4')
      ]

      const createdMatches: BracketMatchRecord[] = []
      const bracketRepo = createFakeBracketRepository({
        createMany: vi.fn().mockImplementation((matches) => {
          const created = matches.map((m: any, i: number) => ({
            ...m,
            id: `bm-${i + 1}`,
            created_at: '2026-08-01T00:00:00Z'
          }))
          createdMatches.push(...created)
          return Promise.resolve(created)
        }),
        deleteByTournamentId: vi.fn().mockResolvedValue(undefined)
      })
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const registrationRepo = createFakeRegistrationRepository({
        findByTournamentId: vi.fn().mockResolvedValue(registrations)
      })
      const eventRepo = createFakeEventRepository({
        findById: vi.fn().mockResolvedValue(event)
      })

      const service = createBracketService(bracketRepo, tournamentRepo, registrationRepo, eventRepo)

      const result = await service.generateBracket('player-1', 'tournament-1')

      expect(result.rounds).toHaveLength(2)
      expect(result.rounds[0].matches).toHaveLength(2)
      expect(result.rounds[1].matches).toHaveLength(1)
    })

    it('throws when not the organizer', async () => {
      const event = makeEventRecord({ created_by_player_id: 'other-player' })
      const tournament = makeTournamentRecord()

      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const eventRepo = createFakeEventRepository({
        findById: vi.fn().mockResolvedValue(event)
      })

      const service = createBracketService(
        createFakeBracketRepository(),
        tournamentRepo,
        createFakeRegistrationRepository(),
        eventRepo
      )

      await expect(service.generateBracket('player-1', 'tournament-1')).rejects.toThrow(
        BracketServiceError
      )
    })

    it('throws when tournament is in progress', async () => {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord({ status: 'in_progress' })

      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const eventRepo = createFakeEventRepository({
        findById: vi.fn().mockResolvedValue(event)
      })

      const service = createBracketService(
        createFakeBracketRepository(),
        tournamentRepo,
        createFakeRegistrationRepository(),
        eventRepo
      )

      await expect(service.generateBracket('player-1', 'tournament-1')).rejects.toThrow(
        BracketServiceError
      )
    })

    it('throws when fewer than 2 participants', async () => {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord()
      const registrations = [makeRegistrationRecord('reg-1', 'player-1')]

      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const registrationRepo = createFakeRegistrationRepository({
        findByTournamentId: vi.fn().mockResolvedValue(registrations)
      })
      const eventRepo = createFakeEventRepository({
        findById: vi.fn().mockResolvedValue(event)
      })

      const service = createBracketService(
        createFakeBracketRepository(),
        tournamentRepo,
        registrationRepo,
        eventRepo
      )

      await expect(service.generateBracket('player-1', 'tournament-1')).rejects.toThrow(
        BracketServiceError
      )
    })

    it('only generates a bracket from registrations in the given category, ignoring others', async () => {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord({ status: 'open' })
      const registrations = [
        makeRegistrationRecord('reg-1', 'player-1', { category_id: 'cat-novice' }),
        makeRegistrationRecord('reg-2', 'player-2', { category_id: 'cat-novice' }),
        makeRegistrationRecord('reg-3', 'player-3', { category_id: 'cat-open' })
      ]

      const bracketRepo = createFakeBracketRepository({
        createMany: vi.fn().mockImplementation((matches) =>
          Promise.resolve(matches.map((m: BracketMatchRecord, i: number) => ({ ...m, id: `bm-${i + 1}` })))
        )
      })
      const tournamentRepo = createFakeTournamentRepository({ findById: vi.fn().mockResolvedValue(tournament) })
      const registrationRepo = createFakeRegistrationRepository({
        findByTournamentId: vi.fn().mockResolvedValue(registrations)
      })
      const eventRepo = createFakeEventRepository({ findById: vi.fn().mockResolvedValue(event) })

      const service = createBracketService(bracketRepo, tournamentRepo, registrationRepo, eventRepo)
      const result = await service.generateBracket('player-1', 'tournament-1', 'cat-novice')

      expect(result.category_id).toBe('cat-novice')
      expect(result.rounds[0].matches).toHaveLength(1)
      expect(bracketRepo.deleteByTournamentId).toHaveBeenCalledWith('tournament-1', 'cat-novice')
      const [insertedMatches] = (bracketRepo.createMany as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(insertedMatches.every((m: BracketMatchRecord) => m.category_id === 'cat-novice')).toBe(true)
    })

    it('rejects generating a category bracket with fewer than 2 registrations in that category', async () => {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord({ status: 'open' })
      const registrations = [
        makeRegistrationRecord('reg-1', 'player-1', { category_id: 'cat-novice' }),
        makeRegistrationRecord('reg-2', 'player-2', { category_id: 'cat-open' }),
        makeRegistrationRecord('reg-3', 'player-3', { category_id: 'cat-open' })
      ]
      const tournamentRepo = createFakeTournamentRepository({ findById: vi.fn().mockResolvedValue(tournament) })
      const registrationRepo = createFakeRegistrationRepository({
        findByTournamentId: vi.fn().mockResolvedValue(registrations)
      })
      const eventRepo = createFakeEventRepository({ findById: vi.fn().mockResolvedValue(event) })

      const service = createBracketService(
        createFakeBracketRepository(),
        tournamentRepo,
        registrationRepo,
        eventRepo
      )

      await expect(
        service.generateBracket('player-1', 'tournament-1', 'cat-novice')
      ).rejects.toThrow(BracketServiceError)
    })
  })

  describe('updateBracketMatch', () => {
    it('updates bracket match when organizer', async () => {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord()
      const bracketMatch = makeBracketMatchRecord()
      const updatedMatch = { ...bracketMatch, winner_registration_id: 'reg-1', status: 'completed' as const }

      const bracketRepo = createFakeBracketRepository({
        findById: vi.fn().mockResolvedValue(bracketMatch),
        update: vi.fn().mockResolvedValue(updatedMatch)
      })
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const eventRepo = createFakeEventRepository({
        findById: vi.fn().mockResolvedValue(event)
      })

      const service = createBracketService(
        bracketRepo,
        tournamentRepo,
        createFakeRegistrationRepository(),
        eventRepo
      )

      const result = await service.updateBracketMatch('player-1', 'bracket-match-1', {
        winner_registration_id: 'reg-1',
        status: 'completed'
      })

      expect(result.winner_registration_id).toBe('reg-1')
      expect(result.status).toBe('completed')
    })

    it('throws when not the organizer', async () => {
      const event = makeEventRecord({ created_by_player_id: 'other-player' })
      const tournament = makeTournamentRecord()
      const bracketMatch = makeBracketMatchRecord()

      const bracketRepo = createFakeBracketRepository({
        findById: vi.fn().mockResolvedValue(bracketMatch)
      })
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const eventRepo = createFakeEventRepository({
        findById: vi.fn().mockResolvedValue(event)
      })

      const service = createBracketService(
        bracketRepo,
        tournamentRepo,
        createFakeRegistrationRepository(),
        eventRepo
      )

      await expect(
        service.updateBracketMatch('player-1', 'bracket-match-1', { status: 'completed' })
      ).rejects.toThrow(BracketServiceError)
    })
  })
})
