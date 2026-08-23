import { describe, it, expect, vi } from 'vitest'
import {
  createBracketService,
  BracketServiceError
} from '../../server/domains/event/services/bracket.service'
import type { BracketRepository } from '../../server/domains/event/repositories/bracket.repository'
import type {
  TournamentRepository,
  TournamentRegistrationRepository
} from '../../server/domains/event/repositories/tournament.repository'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type { BracketMatchRecord } from '../../server/domains/event/dto/bracket.dto'
import type {
  TournamentRecord,
  TournamentRegistrationRecord
} from '../../server/domains/event/dto/tournament.dto'
import type { EventRecord } from '../../server/domains/event/dto/event.dto'

function createFakeBracketRepository(overrides?: Partial<BracketRepository>): BracketRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByTournamentId: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    setParticipant: vi.fn().mockResolvedValue(null),
    deleteByTournamentId: vi.fn().mockResolvedValue(undefined),
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
          const created = matches.map((m: BracketMatchRecord, i: number) => ({
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

    // Regression: non-power-of-two entrant counts used to emit a phantom
    // first-round slot with both participants null, status 'bye' and a null
    // winner — a match that advanced nobody.
    it.each([
      [3, 4, 1],
      [5, 8, 3],
      [6, 8, 2],
      [7, 8, 1]
    ])(
      'seeds %i entrants into a %i-slot bracket with %i byes and no empty slots',
      async (entrantCount, bracketSize, expectedByes) => {
        const event = makeEventRecord()
        const tournament = makeTournamentRecord({ status: 'open' })
        const registrations = Array.from({ length: entrantCount }, (_, i) =>
          makeRegistrationRecord(`reg-${i + 1}`, `player-${i + 1}`)
        )

        let inserted: BracketMatchRecord[] = []
        const bracketRepo = createFakeBracketRepository({
          createMany: vi.fn().mockImplementation((matches) => {
            inserted = matches
            return Promise.resolve(
              matches.map((m: BracketMatchRecord, i: number) => ({
                ...m,
                id: `bm-${i + 1}`,
                created_at: '2026-08-01T00:00:00Z'
              }))
            )
          }),
          deleteByTournamentId: vi.fn().mockResolvedValue(undefined)
        })
        const service = createBracketService(
          bracketRepo,
          createFakeTournamentRepository({ findById: vi.fn().mockResolvedValue(tournament) }),
          createFakeRegistrationRepository({
            findByTournamentId: vi.fn().mockResolvedValue(registrations)
          }),
          createFakeEventRepository({ findById: vi.fn().mockResolvedValue(event) })
        )

        await service.generateBracket('player-1', 'tournament-1')

        const firstRound = inserted.filter((m) => m.round === 1)

        expect(firstRound).toHaveLength(bracketSize / 2)
        expect(firstRound.filter((m) => m.status === 'bye')).toHaveLength(expectedByes)

        for (const match of firstRound) {
          expect(
            match.participant1_registration_id,
            'no first-round slot may be entirely empty'
          ).not.toBeNull()
        }

        for (const bye of firstRound.filter((m) => m.status === 'bye')) {
          expect(bye.participant2_registration_id).toBeNull()
          expect(bye.winner_registration_id, 'a bye must advance its entrant').toBe(
            bye.participant1_registration_id
          )
        }

        // Every entrant appears exactly once in round one.
        const seeded = firstRound.flatMap((m) =>
          [m.participant1_registration_id, m.participant2_registration_id].filter(Boolean)
        )
        expect(new Set(seeded).size).toBe(entrantCount)
        expect(seeded).toHaveLength(entrantCount)
      }
    )

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
        createMany: vi
          .fn()
          .mockImplementation((matches) =>
            Promise.resolve(
              matches.map((m: BracketMatchRecord, i: number) => ({ ...m, id: `bm-${i + 1}` }))
            )
          )
      })
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
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
      expect(insertedMatches.every((m: BracketMatchRecord) => m.category_id === 'cat-novice')).toBe(
        true
      )
    })

    it('rejects generating a category bracket with fewer than 2 registrations in that category', async () => {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord({ status: 'open' })
      const registrations = [
        makeRegistrationRecord('reg-1', 'player-1', { category_id: 'cat-novice' }),
        makeRegistrationRecord('reg-2', 'player-2', { category_id: 'cat-open' }),
        makeRegistrationRecord('reg-3', 'player-3', { category_id: 'cat-open' })
      ]
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
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

    it('generates double elimination bracket with winners and losers brackets', async () => {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord({ status: 'open', format: 'double_elimination' })
      const registrations = [
        makeRegistrationRecord('reg-1', 'player-1'),
        makeRegistrationRecord('reg-2', 'player-2'),
        makeRegistrationRecord('reg-3', 'player-3'),
        makeRegistrationRecord('reg-4', 'player-4')
      ]

      const createdMatches: BracketMatchRecord[] = []
      const bracketRepo = createFakeBracketRepository({
        createMany: vi.fn().mockImplementation((matches) => {
          const result = matches.map((m: BracketMatchRecord, i: number) => ({
            ...m,
            id: `bm-${i + 1}`,
            created_at: '2026-08-01T00:00:00Z'
          }))
          createdMatches.push(...result)
          return Promise.resolve(result)
        })
      })
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const registrationRepo = createFakeRegistrationRepository({
        findByTournamentId: vi.fn().mockResolvedValue(registrations)
      })
      const eventRepo = createFakeEventRepository({ findById: vi.fn().mockResolvedValue(event) })

      const service = createBracketService(bracketRepo, tournamentRepo, registrationRepo, eventRepo)
      await service.generateBracket('player-1', 'tournament-1')

      const winnersMatches = createdMatches.filter((m) => m.round < 100)
      const losersMatches = createdMatches.filter((m) => m.round >= 100 && m.round < 200)
      const grandFinal = createdMatches.filter((m) => m.round === 200)

      expect(winnersMatches.length).toBeGreaterThan(0)
      expect(losersMatches.length).toBeGreaterThan(0)
      expect(grandFinal).toHaveLength(1)
    })

    it('generates round robin bracket where everyone plays everyone', async () => {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord({ status: 'open', format: 'round_robin' })
      const registrations = [
        makeRegistrationRecord('reg-1', 'player-1'),
        makeRegistrationRecord('reg-2', 'player-2'),
        makeRegistrationRecord('reg-3', 'player-3'),
        makeRegistrationRecord('reg-4', 'player-4')
      ]

      const createdMatches: BracketMatchRecord[] = []
      const bracketRepo = createFakeBracketRepository({
        createMany: vi.fn().mockImplementation((matches) => {
          const result = matches.map((m: BracketMatchRecord, i: number) => ({
            ...m,
            id: `bm-${i + 1}`,
            created_at: '2026-08-01T00:00:00Z'
          }))
          createdMatches.push(...result)
          return Promise.resolve(result)
        })
      })
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const registrationRepo = createFakeRegistrationRepository({
        findByTournamentId: vi.fn().mockResolvedValue(registrations)
      })
      const eventRepo = createFakeEventRepository({ findById: vi.fn().mockResolvedValue(event) })

      const service = createBracketService(bracketRepo, tournamentRepo, registrationRepo, eventRepo)
      await service.generateBracket('player-1', 'tournament-1')

      // 4 players: each plays 3 others = 4*3/2 = 6 matches
      expect(createdMatches).toHaveLength(6)

      // All matches should have both participants assigned (ready status)
      expect(createdMatches.every((m) => m.status === 'ready')).toBe(true)
      expect(
        createdMatches.every(
          (m) => m.participant1_registration_id && m.participant2_registration_id
        )
      ).toBe(true)
    })

    it('generates pool play bracket with pools and playoffs', async () => {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord({ status: 'open', format: 'pool_play' })
      const registrations = Array.from({ length: 8 }, (_, i) =>
        makeRegistrationRecord(`reg-${i + 1}`, `player-${i + 1}`)
      )

      const createdMatches: BracketMatchRecord[] = []
      const bracketRepo = createFakeBracketRepository({
        createMany: vi.fn().mockImplementation((matches) => {
          const result = matches.map((m: BracketMatchRecord, i: number) => ({
            ...m,
            id: `bm-${i + 1}`,
            created_at: '2026-08-01T00:00:00Z'
          }))
          createdMatches.push(...result)
          return Promise.resolve(result)
        })
      })
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const registrationRepo = createFakeRegistrationRepository({
        findByTournamentId: vi.fn().mockResolvedValue(registrations)
      })
      const eventRepo = createFakeEventRepository({ findById: vi.fn().mockResolvedValue(event) })

      const service = createBracketService(bracketRepo, tournamentRepo, registrationRepo, eventRepo)
      await service.generateBracket('player-1', 'tournament-1')

      // Pool matches (rounds 10-19) and playoff matches (rounds 50+)
      const poolMatches = createdMatches.filter((m) => m.round >= 10 && m.round < 50)
      const playoffMatches = createdMatches.filter((m) => m.round >= 50)

      expect(poolMatches.length).toBeGreaterThan(0)
      expect(playoffMatches.length).toBeGreaterThan(0)

      // Pool matches should have participants assigned
      expect(
        poolMatches.every((m) => m.participant1_registration_id && m.participant2_registration_id)
      ).toBe(true)
    })
  })

  describe('updateBracketMatch', () => {
    it('updates bracket match when organizer', async () => {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord()
      const bracketMatch = makeBracketMatchRecord()
      const updatedMatch = {
        ...bracketMatch,
        winner_registration_id: 'reg-1',
        status: 'completed' as const
      }

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

  describe('winner advancement', () => {
    // Before this existed, an organiser could record every round-one result and
    // round two stayed empty — the tournament could not progress past round one.
    function setup(options: {
      match: BracketMatchRecord
      siblings: BracketMatchRecord[]
      format?: TournamentRecord['format']
    }) {
      const updated = {
        ...options.match,
        winner_registration_id: options.match.participant1_registration_id,
        status: 'completed' as const
      }
      const setParticipant = vi.fn().mockResolvedValue(updated)
      const bracketRepo = createFakeBracketRepository({
        findById: vi.fn().mockResolvedValue(options.match),
        update: vi.fn().mockResolvedValue(updated),
        findByTournamentId: vi.fn().mockResolvedValue(options.siblings),
        setParticipant
      })
      const service = createBracketService(
        bracketRepo,
        createFakeTournamentRepository({
          findById: vi
            .fn()
            .mockResolvedValue(
              makeTournamentRecord({ format: options.format ?? 'single_elimination' })
            )
        }),
        createFakeRegistrationRepository(),
        createFakeEventRepository({ findById: vi.fn().mockResolvedValue(makeEventRecord()) })
      )
      return { service, setParticipant, winner: updated.winner_registration_id }
    }

    it('promotes the winner of position 1 into slot 1 of the next round', async () => {
      const match = makeBracketMatchRecord({ id: 'bm-1', round: 1, position: 1 })
      const next = makeBracketMatchRecord({
        id: 'bm-next',
        round: 2,
        position: 1,
        participant1_registration_id: null,
        participant2_registration_id: null,
        status: 'pending'
      })
      const { service, setParticipant, winner } = setup({ match, siblings: [match, next] })

      await service.updateBracketMatch('player-1', 'bm-1', {
        winner_registration_id: 'reg-1',
        status: 'completed'
      })

      expect(setParticipant).toHaveBeenCalledWith('bm-next', 1, winner, 'pending')
    })

    it('promotes the winner of position 2 into slot 2 of the same next match', async () => {
      const match = makeBracketMatchRecord({
        id: 'bm-2',
        round: 1,
        position: 2,
        participant1_registration_id: 'reg-3',
        participant2_registration_id: 'reg-4'
      })
      const next = makeBracketMatchRecord({
        id: 'bm-next',
        round: 2,
        position: 1,
        participant1_registration_id: 'reg-1',
        participant2_registration_id: null,
        status: 'pending'
      })
      const { service, setParticipant } = setup({ match, siblings: [match, next] })

      await service.updateBracketMatch('player-1', 'bm-2', {
        winner_registration_id: 'reg-3',
        status: 'completed'
      })

      // Slot 1 is already taken, so the match becomes playable.
      expect(setParticipant).toHaveBeenCalledWith('bm-next', 2, 'reg-3', 'ready')
    })

    it('does nothing after the final, which has no next round', async () => {
      const final = makeBracketMatchRecord({ id: 'bm-final', round: 3, position: 1 })
      const { service, setParticipant } = setup({ match: final, siblings: [final] })

      await service.updateBracketMatch('player-1', 'bm-final', {
        winner_registration_id: 'reg-1',
        status: 'completed'
      })

      expect(setParticipant).not.toHaveBeenCalled()
    })

    it('does not advance in round robin, where every fixture is drawn up front', async () => {
      const match = makeBracketMatchRecord({ id: 'bm-1', round: 1, position: 1 })
      const next = makeBracketMatchRecord({ id: 'bm-next', round: 2, position: 1 })
      const { service, setParticipant } = setup({
        match,
        siblings: [match, next],
        format: 'round_robin'
      })

      await service.updateBracketMatch('player-1', 'bm-1', {
        winner_registration_id: 'reg-1',
        status: 'completed'
      })

      expect(setParticipant).not.toHaveBeenCalled()
    })

    it('leaves the losers bracket alone, since its routing is not implemented', async () => {
      const match = makeBracketMatchRecord({ id: 'bm-l1', round: 101, position: 1 })
      const next = makeBracketMatchRecord({ id: 'bm-l2', round: 102, position: 1 })
      const { service, setParticipant } = setup({
        match,
        siblings: [match, next],
        format: 'double_elimination'
      })

      await service.updateBracketMatch('player-1', 'bm-l1', {
        winner_registration_id: 'reg-1',
        status: 'completed'
      })

      expect(setParticipant).not.toHaveBeenCalled()
    })

    it('rejects a winner who did not play the match', async () => {
      const match = makeBracketMatchRecord({ id: 'bm-1' }) // reg-1 vs reg-2
      const { service } = setup({ match, siblings: [match] })

      await expect(
        service.updateBracketMatch('player-1', 'bm-1', {
          winner_registration_id: 'reg-999',
          status: 'completed'
        })
      ).rejects.toThrow(/must be one of the two participants/)
    })
  })

  describe('bye propagation at generation time', () => {
    it('places first-round bye winners into round two', async () => {
      // 5 entrants → 8-slot bracket → 3 byes. Those three must already occupy
      // round-two slots, or nothing would ever fill them.
      const registrations = Array.from({ length: 5 }, (_, i) =>
        makeRegistrationRecord(`reg-${i + 1}`, `player-${i + 1}`)
      )

      let inserted: BracketMatchRecord[] = []
      const bracketRepo = createFakeBracketRepository({
        createMany: vi.fn().mockImplementation((matches) => {
          inserted = matches
          return Promise.resolve(
            matches.map((m: BracketMatchRecord, i: number) => ({
              ...m,
              id: `bm-${i + 1}`,
              created_at: 'x'
            }))
          )
        }),
        deleteByTournamentId: vi.fn().mockResolvedValue(undefined)
      })

      const service = createBracketService(
        bracketRepo,
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeTournamentRecord({ status: 'open' }))
        }),
        createFakeRegistrationRepository({
          findByTournamentId: vi.fn().mockResolvedValue(registrations)
        }),
        createFakeEventRepository({ findById: vi.fn().mockResolvedValue(makeEventRecord()) })
      )

      await service.generateBracket('player-1', 'tournament-1')

      const byeWinners = inserted
        .filter((m) => m.round === 1 && m.status === 'bye')
        .map((m) => m.winner_registration_id)
      expect(byeWinners).toHaveLength(3)

      const roundTwoOccupants = inserted
        .filter((m) => m.round === 2)
        .flatMap((m) => [m.participant1_registration_id, m.participant2_registration_id])
        .filter(Boolean)

      for (const winner of byeWinners) {
        expect(roundTwoOccupants, `bye winner ${winner} never reached round two`).toContain(winner)
      }
    })
  })
})
