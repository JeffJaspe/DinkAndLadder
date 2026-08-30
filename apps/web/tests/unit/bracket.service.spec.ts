import { describe, it, expect, vi } from 'vitest'
import {
  createBracketService,
  orientScores,
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
  TournamentFormat,
  TournamentRecord,
  TournamentRegistrationRecord,
  TournamentRegistrationWithPlayerDto
} from '../../server/domains/event/dto/tournament.dto'
import type { EventRecord } from '../../server/domains/event/dto/event.dto'
import type { TournamentCategoryRepository } from '../../server/domains/event/repositories/tournament-category.repository'
import type { MatchRepository } from '../../server/domains/match/repositories/match.repository'
import type { MatchScoreLookupRow } from '../../server/domains/match/dto/match.dto'

function createFakeBracketRepository(overrides?: Partial<BracketRepository>): BracketRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByTournamentId: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    setLiveScore: vi.fn().mockResolvedValue(null),
    setParticipant: vi.fn().mockResolvedValue(null),
    deleteByTournamentId: vi.fn().mockResolvedValue(undefined),
    // Nothing played by default: the guard on undo and unlock is what most
    // fixtures need out of the way, not what they are testing.
    countRecordedResults: vi.fn().mockResolvedValue(0),
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
    setBracketLock: vi.fn(),
    ...overrides
  }
}

function createFakeRegistrationRepository(
  overrides?: Partial<TournamentRegistrationRepository>
): TournamentRegistrationRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findCategoryEntrants: vi.fn().mockResolvedValue([]),
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
    countByClubForLimits: vi
      .fn()
      .mockResolvedValue({ drafts: 0, liveTournaments: 0, liveOpenPlay: 0 }),
    ...overrides
  }
}

function createFakeMatchRepository(
  rows: MatchScoreLookupRow[] = [],
  overrides?: Partial<MatchRepository>
): MatchRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    createPendingVerifications: vi.fn().mockResolvedValue([]),
    updateVerificationDecision: vi.fn(),
    updateMatchStatus: vi.fn().mockResolvedValue(undefined),
    transitionMatchStatus: vi.fn().mockResolvedValue(true),
    createScoreProposal: vi.fn(),
    findScoreRowsByMatchIds: vi.fn().mockResolvedValue(rows),
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
    start_time: null,
    end_time: null,
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
    match_format: 'doubles',
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
    bracket_locked_at: null,
    bracket_locked_by_player_id: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides
  }
}

/**
 * A tournament whose draw the organiser has frozen.
 *
 * Locking is what publishes a draw and makes results recordable against it, so
 * "a draw anyone can read" and "a draw a score can be written to" are both,
 * necessarily, locked draws. Reading and scoring tests use this; generation
 * tests use the unlocked fixture above, because generating into a locked draw
 * is refused by design.
 */
function makeLockedTournamentRecord(overrides?: Partial<TournamentRecord>): TournamentRecord {
  return makeTournamentRecord({
    bracket_locked_at: '2026-08-10T09:00:00Z',
    bracket_locked_by_player_id: 'player-1',
    ...overrides
  })
}

/**
 * Seeding needs ratings, so `generateBracket` reads the joined list rather than
 * the bare registration rows. Unrated by default: most fixtures here care about
 * bracket shape, not seed order, and `sortBySeed` then falls back to
 * `registered_at`, which every fixture shares — a stable, insertion-order result.
 *
 * The repository hands back BOTH of a player's ratings and the service picks
 * one by the category's match type. A fixture that says `rating: 4.0` means
 * "this player rates 4.0 in whatever discipline this draw is", so the shorthand
 * sets both columns — a test about seed order should not have to state a match
 * type it does not care about. Set `singles_rating`/`doubles_rating` explicitly
 * to test the resolution itself.
 */
type EntrantRow = Omit<TournamentRegistrationWithPlayerDto, 'rating'> & {
  singles_rating: number | null
  doubles_rating: number | null
}

function makeRegistrationRecord(
  id: string,
  playerId: string,
  overrides?: Partial<EntrantRow> & { rating?: number | null }
): EntrantRow {
  const { rating, ...rest } = overrides ?? {}
  return {
    id,
    tournament_id: 'tournament-1',
    player_id: playerId,
    partner_player_id: null,
    status: 'confirmed',
    registered_at: '2026-08-01T00:00:00Z',
    confirmed_at: '2026-08-01T00:00:00Z',
    category_id: null,
    display_name: `Player ${playerId.replace('player-', '')}`,
    singles_rating: rating ?? null,
    doubles_rating: rating ?? null,
    partner_display_name: null,
    ...rest
  }
}

/**
 * `createMany` fake: hands the generated rows to `sink` for assertions and
 * returns them with ids attached, the way the real repository does.
 */
function captureInto(sink: (matches: BracketMatchRecord[]) => void) {
  return vi.fn().mockImplementation((matches: BracketMatchRecord[]) => {
    sink(matches)
    return Promise.resolve(
      matches.map((m, i) => ({ ...m, id: `bm-${i + 1}`, created_at: '2026-08-01T00:00:00Z' }))
    )
  })
}

/** The bare registration row recordMatchResult reads to find who played. */
function makeRegistrationRow(
  id: string,
  playerId: string,
  partnerPlayerId: string | null = null
): TournamentRegistrationRecord {
  return {
    id,
    tournament_id: 'tournament-1',
    player_id: playerId,
    partner_player_id: partnerPlayerId,
    status: 'confirmed',
    registered_at: '2026-08-01T00:00:00Z',
    confirmed_at: '2026-08-01T00:00:00Z',
    category_id: null,
    created_at: '2026-08-01T00:00:00Z'
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
    live_score: null,
    live_score_updated_at: null,
    started_at: null,
    ...overrides
  }
}

describe('BracketService', () => {
  describe('getBracket', () => {
    it('returns bracket grouped by rounds', async () => {
      const tournament = makeLockedTournamentRecord()
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
        findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
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
            findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
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

    // F-23. A pending registration is awaiting the organiser's approval and does
    // not hold a place — the vacancy counts on the tournament page already
    // assume exactly that. Seeding them meant a category could read "full"
    // while the bracket contained people nobody had approved.
    it('seeds confirmed registrations only, ignoring pending ones', async () => {
      const registrations = [
        makeRegistrationRecord('reg-1', 'player-1'),
        makeRegistrationRecord('reg-2', 'player-2'),
        makeRegistrationRecord('reg-3', 'player-3', { status: 'pending' })
      ]

      let inserted: BracketMatchRecord[] = []
      const service = createBracketService(
        createFakeBracketRepository({ createMany: captureInto((m) => (inserted = m)) }),
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeTournamentRecord({ status: 'open' }))
        }),
        createFakeRegistrationRepository({
          findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
        }),
        createFakeEventRepository({ findById: vi.fn().mockResolvedValue(makeEventRecord()) })
      )

      await service.generateBracket('player-1', 'tournament-1')

      const seeded = inserted
        .filter((m) => m.round === 1)
        .flatMap((m) => [m.participant1_registration_id, m.participant2_registration_id])
        .filter(Boolean)

      expect(seeded).not.toContain('reg-3')
      expect(new Set(seeded)).toEqual(new Set(['reg-1', 'reg-2']))
    })

    it('names the pending registrations when too few are confirmed', async () => {
      const registrations = [
        makeRegistrationRecord('reg-1', 'player-1'),
        makeRegistrationRecord('reg-2', 'player-2', { status: 'pending' }),
        makeRegistrationRecord('reg-3', 'player-3', { status: 'pending' })
      ]

      const service = createBracketService(
        createFakeBracketRepository(),
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeTournamentRecord({ status: 'open' }))
        }),
        createFakeRegistrationRepository({
          findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
        }),
        createFakeEventRepository({ findById: vi.fn().mockResolvedValue(makeEventRecord()) })
      )

      await expect(service.generateBracket('player-1', 'tournament-1')).rejects.toThrow(
        /1 confirmed, 2 still awaiting approval/
      )
    })

    // buildFirstRound allocates byes "to the top seeds first" — an assumption
    // nothing satisfied while the list arrived in repository order and was then
    // shuffled. With 3 entrants in a 4-slot bracket there is exactly one bye,
    // and it must go to the highest-rated player.
    it('orders seeds by rating descending, so the bye goes to the top seed', async () => {
      const registrations = [
        makeRegistrationRecord('reg-1', 'player-1', { rating: 3.5 }),
        makeRegistrationRecord('reg-2', 'player-2', { rating: 4.75 }),
        makeRegistrationRecord('reg-3', 'player-3', { rating: 4.0 })
      ]

      let inserted: BracketMatchRecord[] = []
      const service = createBracketService(
        createFakeBracketRepository({ createMany: captureInto((m) => (inserted = m)) }),
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeTournamentRecord({ status: 'open' }))
        }),
        createFakeRegistrationRepository({
          findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
        }),
        createFakeEventRepository({ findById: vi.fn().mockResolvedValue(makeEventRecord()) })
      )

      await service.generateBracket('player-1', 'tournament-1')

      const byes = inserted.filter((m) => m.round === 1 && m.status === 'bye')
      expect(byes).toHaveLength(1)
      expect(byes[0].participant1_registration_id).toBe('reg-2')
    })

    // A bye is an advantage. Handing it to someone with no record over someone
    // with a proven one is the wrong way round.
    it('seeds unrated players last', async () => {
      const registrations = [
        makeRegistrationRecord('reg-1', 'player-1', { rating: null }),
        makeRegistrationRecord('reg-2', 'player-2', { rating: 3.0 }),
        makeRegistrationRecord('reg-3', 'player-3', { rating: 4.0 })
      ]

      let inserted: BracketMatchRecord[] = []
      const service = createBracketService(
        createFakeBracketRepository({ createMany: captureInto((m) => (inserted = m)) }),
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeTournamentRecord({ status: 'open' }))
        }),
        createFakeRegistrationRepository({
          findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
        }),
        createFakeEventRepository({ findById: vi.fn().mockResolvedValue(makeEventRecord()) })
      )

      await service.generateBracket('player-1', 'tournament-1')

      const byes = inserted.filter((m) => m.round === 1 && m.status === 'bye')
      expect(byes[0].participant1_registration_id).toBe('reg-3')
    })

    it('hydrates names, ratings and doubles partners onto both bracket slots', async () => {
      const registrations = [
        makeRegistrationRecord('reg-1', 'player-1', {
          display_name: 'Ana Cruz',
          rating: 4.25,
          partner_display_name: 'Bea Lim'
        }),
        makeRegistrationRecord('reg-2', 'player-2', {
          display_name: 'Carlo Reyes',
          rating: 3.8,
          partner_display_name: 'Dino Uy'
        })
      ]

      const service = createBracketService(
        createFakeBracketRepository({ createMany: captureInto(() => {}) }),
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeTournamentRecord({ status: 'open' }))
        }),
        createFakeRegistrationRepository({
          findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
        }),
        createFakeEventRepository({ findById: vi.fn().mockResolvedValue(makeEventRecord()) })
      )

      const result = await service.generateBracket('player-1', 'tournament-1')
      const final = result.rounds[0].matches[0]

      expect(final.participant1).toEqual({
        registration_id: 'reg-1',
        display_name: 'Ana Cruz',
        rating: 4.25,
        partner_display_name: 'Bea Lim'
      })
      expect(final.participant2?.display_name).toBe('Carlo Reyes')
      expect(final.participant2?.rating).toBe(3.8)
    })

    it('leaves an unfilled slot null rather than inventing a participant', async () => {
      const matches = [
        makeBracketMatchRecord({
          id: 'bm-1',
          round: 2,
          participant1_registration_id: null,
          participant2_registration_id: null,
          status: 'pending'
        })
      ]

      const service = createBracketService(
        createFakeBracketRepository({
          findByTournamentId: vi.fn().mockResolvedValue(matches)
        }),
        createFakeTournamentRepository({
          // A read, despite sitting in the generateBracket block: locked, so it
          // is a published draw anyone may look at.
          findById: vi.fn().mockResolvedValue(makeLockedTournamentRecord())
        }),
        createFakeRegistrationRepository({
          findByTournamentIdWithPlayers: vi
            .fn()
            .mockResolvedValue([makeRegistrationRecord('reg-1', 'player-1')])
        }),
        createFakeEventRepository()
      )

      const result = await service.getBracket('tournament-1')

      expect(result.rounds[0].matches[0].participant1).toBeNull()
      expect(result.rounds[0].matches[0].participant2).toBeNull()
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
        findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
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
        findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
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
        findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
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
        findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
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
        findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
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

    it('generates a round robin -> single elimination bracket with pools and playoffs', async () => {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord({
        status: 'open',
        format: 'round_robin_single_elimination'
      })
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
        findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
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
          findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
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

  /**
   * The orientation trap.
   *
   * `match_scores` is keyed to team1/team2, decided when the match was
   * submitted. A bracket slot is decided when the draw was made. Nothing keeps
   * the two in step, so a score lined up naively is a coin flip — and a
   * reversed score looks entirely believable, which is exactly why it has to
   * be derived rather than assumed.
   */
  describe('orientScores', () => {
    const scores = [
      { set_number: 1, team1_score: 11, team2_score: 9 },
      { set_number: 2, team1_score: 8, team2_score: 11 }
    ]

    it('keeps the columns as they are when participant1 is team 1', () => {
      const row = {
        participants: [
          { player_id: 'player-a', team_number: 1 as const },
          { player_id: 'player-b', team_number: 2 as const }
        ],
        scores
      }

      expect(orientScores(row, ['player-a'], ['player-b'])).toEqual([
        { set_number: 1, participant1_score: 11, participant2_score: 9 },
        { set_number: 2, participant1_score: 8, participant2_score: 11 }
      ])
    })

    it('swaps the columns when participant1 is team 2', () => {
      const row = {
        participants: [
          { player_id: 'player-a', team_number: 1 as const },
          { player_id: 'player-b', team_number: 2 as const }
        ],
        scores
      }

      // Same match, opposite draw order: what the match calls team 2 is the
      // bracket's first slot, so every set has to read the other way round.
      expect(orientScores(row, ['player-b'], ['player-a'])).toEqual([
        { set_number: 1, participant1_score: 9, participant2_score: 11 },
        { set_number: 2, participant1_score: 11, participant2_score: 8 }
      ])
    })

    it('resolves a doubles slot through the partner when the entrant is absent', () => {
      const row = {
        participants: [
          { player_id: 'partner-of-a', team_number: 2 as const },
          { player_id: 'player-b', team_number: 1 as const }
        ],
        scores
      }

      // Only the partner appears in the match rows; the slot is still theirs.
      expect(orientScores(row, ['player-a', 'partner-of-a'], ['player-b'])[0]).toEqual({
        set_number: 1,
        participant1_score: 9,
        participant2_score: 11
      })
    })

    it('infers the second slot from the first alone', () => {
      const row = {
        participants: [{ player_id: 'player-a', team_number: 2 as const }],
        scores
      }

      expect(orientScores(row, [], ['player-a'])[0]).toEqual({
        set_number: 1,
        participant1_score: 11,
        participant2_score: 9
      })
    })

    it('returns nothing when neither slot can be matched to a team', () => {
      const row = {
        participants: [
          { player_id: 'someone-else', team_number: 1 as const },
          { player_id: 'another', team_number: 2 as const }
        ],
        scores
      }

      expect(orientScores(row, ['player-a'], ['player-b'])).toEqual([])
    })

    it('returns nothing when both slots resolve to the same team', () => {
      const row = {
        participants: [
          { player_id: 'player-a', team_number: 1 as const },
          { player_id: 'player-b', team_number: 1 as const }
        ],
        scores
      }

      // The participant rows contradict the draw. Guessing here would print a
      // number under the wrong name.
      expect(orientScores(row, ['player-a'], ['player-b'])).toEqual([])
    })

    it('returns nothing when the match has no recorded sets', () => {
      const row = {
        participants: [{ player_id: 'player-a', team_number: 1 as const }],
        scores: []
      }

      expect(orientScores(row, ['player-a'], ['player-b'])).toEqual([])
    })
  })

  describe('getBracket score hydration', () => {
    const linkedMatch = makeBracketMatchRecord({
      id: 'bm-1',
      match_id: 'match-1',
      participant1_registration_id: 'reg-1',
      participant2_registration_id: 'reg-2',
      status: 'completed'
    })

    const entrants = [
      makeRegistrationRecord('reg-1', 'player-1'),
      makeRegistrationRecord('reg-2', 'player-2')
    ]

    const scoreRow: MatchScoreLookupRow = {
      match_id: 'match-1',
      participants: [
        { player_id: 'player-1', team_number: 1 },
        { player_id: 'player-2', team_number: 2 }
      ],
      scores: [{ set_number: 1, team1_score: 11, team2_score: 7 }]
    }

    function serviceWith(matchRepo?: MatchRepository) {
      return createBracketService(
        createFakeBracketRepository({
          findByTournamentId: vi.fn().mockResolvedValue([linkedMatch])
        }),
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeLockedTournamentRecord())
        }),
        createFakeRegistrationRepository({
          findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(entrants)
        }),
        createFakeEventRepository(),
        matchRepo
      )
    }

    it('attaches scores oriented to the bracket slots', async () => {
      const bracket = await serviceWith(createFakeMatchRepository([scoreRow])).getBracket(
        'tournament-1'
      )

      expect(bracket.rounds[0].matches[0].scores).toEqual([
        { set_number: 1, participant1_score: 11, participant2_score: 7 }
      ])
    })

    it('swaps them when the draw disagrees with the match teams', async () => {
      const flipped: MatchScoreLookupRow = {
        ...scoreRow,
        participants: [
          { player_id: 'player-1', team_number: 2 },
          { player_id: 'player-2', team_number: 1 }
        ]
      }

      const bracket = await serviceWith(createFakeMatchRepository([flipped])).getBracket(
        'tournament-1'
      )

      expect(bracket.rounds[0].matches[0].scores).toEqual([
        { set_number: 1, participant1_score: 7, participant2_score: 11 }
      ])
    })

    it('leaves scores empty when the slot has no linked match', async () => {
      const service = createBracketService(
        createFakeBracketRepository({
          findByTournamentId: vi
            .fn()
            .mockResolvedValue([makeBracketMatchRecord({ id: 'bm-1', match_id: null })])
        }),
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeLockedTournamentRecord())
        }),
        createFakeRegistrationRepository({
          findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(entrants)
        }),
        createFakeEventRepository(),
        createFakeMatchRepository([scoreRow])
      )

      const bracket = await service.getBracket('tournament-1')
      expect(bracket.rounds[0].matches[0].scores).toEqual([])
    })

    it('never queries the match repository when nothing is linked', async () => {
      const matchRepo = createFakeMatchRepository([])
      const service = createBracketService(
        createFakeBracketRepository({
          findByTournamentId: vi
            .fn()
            .mockResolvedValue([makeBracketMatchRecord({ id: 'bm-1', match_id: null })])
        }),
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeLockedTournamentRecord())
        }),
        createFakeRegistrationRepository({
          findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(entrants)
        }),
        createFakeEventRepository(),
        matchRepo
      )

      await service.getBracket('tournament-1')
      expect(matchRepo.findScoreRowsByMatchIds).not.toHaveBeenCalled()
    })

    it('still loads a bracket when no match repository was supplied', async () => {
      const bracket = await serviceWith(undefined).getBracket('tournament-1')

      expect(bracket.rounds[0].matches[0].scores).toEqual([])
      expect(bracket.rounds[0].matches[0].participant1?.display_name).toBe('Player 1')
    })
  })

  /**
   * Recording a result is the only thing that ever writes
   * `bracket_matches.match_id`. Before it existed a draw could name a winner
   * but never a score, because the score lives on a `matches` row nothing was
   * creating.
   */
  describe('recordMatchResult', () => {
    const playable = makeBracketMatchRecord({
      id: 'bm-1',
      match_id: null,
      participant1_registration_id: 'reg-1',
      participant2_registration_id: 'reg-2',
      status: 'ready'
    })

    const result = {
      winner_registration_id: 'reg-1',
      scores: [
        { set_number: 1, participant1_score: 11, participant2_score: 9 },
        { set_number: 2, participant1_score: 11, participant2_score: 7 }
      ]
    }

    function build(
      options: {
        bracketMatch?: BracketMatchRecord | null
        entrants?: Record<string, TournamentRegistrationRecord | null>
        matchRepo?: MatchRepository
        organizerId?: string
      } = {}
    ) {
      const entrants = options.entrants ?? {
        'reg-1': makeRegistrationRow('reg-1', 'player-1'),
        'reg-2': makeRegistrationRow('reg-2', 'player-2')
      }
      const bracketRepo = createFakeBracketRepository({
        findById: vi
          .fn()
          .mockResolvedValue(options.bracketMatch === undefined ? playable : options.bracketMatch),
        update: vi
          .fn()
          .mockImplementation((id: string, input: Record<string, unknown>) =>
            Promise.resolve({ ...playable, ...input, id })
          ),
        findByTournamentId: vi.fn().mockResolvedValue([])
      })
      const matchRepo =
        options.matchRepo ??
        createFakeMatchRepository([], {
          create: vi.fn().mockResolvedValue({ id: 'match-new' } as never),
          updateMatchStatus: vi.fn().mockResolvedValue(undefined)
        })

      const service = createBracketService(
        bracketRepo,
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeLockedTournamentRecord({ match_type: 'doubles' }))
        }),
        createFakeRegistrationRepository({
          findById: vi
            .fn()
            .mockImplementation((id: string) => Promise.resolve(entrants[id] ?? null))
        }),
        createFakeEventRepository({
          findById: vi
            .fn()
            .mockResolvedValue(
              makeEventRecord({ created_by_player_id: options.organizerId ?? 'player-1' })
            )
        }),
        matchRepo
      )

      return { service, bracketRepo, matchRepo }
    }

    it('creates the match with participant1 as team 1', async () => {
      const { service, matchRepo } = build()

      await service.recordMatchResult('player-1', 'bm-1', result)

      expect(matchRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 'event-1',
          match_type: 'doubles',
          participants: [
            { player_id: 'player-1', team_number: 1 },
            { player_id: 'player-2', team_number: 2 }
          ],
          scores: [
            { set_number: 1, team1_score: 11, team2_score: 9 },
            { set_number: 2, team1_score: 11, team2_score: 7 }
          ]
        }),
        'player-1'
      )
    })

    it('puts both members of a doubles pair on their own team', async () => {
      const { service, matchRepo } = build({
        entrants: {
          'reg-1': makeRegistrationRow('reg-1', 'player-1', 'partner-1'),
          'reg-2': makeRegistrationRow('reg-2', 'player-2', 'partner-2')
        }
      })

      await service.recordMatchResult('player-1', 'bm-1', result)

      expect(matchRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          participants: [
            { player_id: 'player-1', team_number: 1 },
            { player_id: 'partner-1', team_number: 1 },
            { player_id: 'player-2', team_number: 2 },
            { player_id: 'partner-2', team_number: 2 }
          ]
        }),
        'player-1'
      )
    })

    it('links the match to the slot and settles it', async () => {
      const { service, bracketRepo } = build()

      await service.recordMatchResult('player-1', 'bm-1', result)

      expect(bracketRepo.update).toHaveBeenCalledWith('bm-1', {
        match_id: 'match-new',
        winner_registration_id: 'reg-1',
        status: 'completed'
      })
    })

    it('marks the match verified — the organiser recording it is the verification', async () => {
      const { service, matchRepo } = build()

      await service.recordMatchResult('player-1', 'bm-1', result)

      expect(matchRepo.updateMatchStatus).toHaveBeenCalledWith(
        'match-new',
        'verified',
        expect.any(String)
      )
    })

    it('refuses a second result for the same slot', async () => {
      const { service } = build({
        bracketMatch: { ...playable, match_id: 'match-already-there' }
      })

      await expect(service.recordMatchResult('player-1', 'bm-1', result)).rejects.toMatchObject({
        status: 409,
        code: 'RESULT_ALREADY_RECORDED'
      })
    })

    it('refuses a slot that still has an empty side', async () => {
      const { service } = build({
        bracketMatch: { ...playable, participant2_registration_id: null }
      })

      await expect(service.recordMatchResult('player-1', 'bm-1', result)).rejects.toMatchObject({
        status: 409,
        code: 'MATCH_NOT_PLAYABLE'
      })
    })

    it('refuses a winner who is not in the match', async () => {
      const { service } = build()

      await expect(
        service.recordMatchResult('player-1', 'bm-1', {
          ...result,
          winner_registration_id: 'reg-99'
        })
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_WINNER' })
    })

    it('refuses a result with no sets', async () => {
      const { service } = build()

      await expect(
        service.recordMatchResult('player-1', 'bm-1', { ...result, scores: [] })
      ).rejects.toMatchObject({ status: 400 })
    })

    it('refuses a negative game score', async () => {
      const { service } = build()

      await expect(
        service.recordMatchResult('player-1', 'bm-1', {
          ...result,
          scores: [{ set_number: 1, participant1_score: -1, participant2_score: 11 }]
        })
      ).rejects.toMatchObject({ status: 400 })
    })

    it('refuses the same set number twice', async () => {
      const { service } = build()

      await expect(
        service.recordMatchResult('player-1', 'bm-1', {
          ...result,
          scores: [
            { set_number: 1, participant1_score: 11, participant2_score: 9 },
            { set_number: 1, participant1_score: 11, participant2_score: 7 }
          ]
        })
      ).rejects.toMatchObject({ status: 400 })
    })

    it('allows a walkover, where the winner took no sets', async () => {
      const { service, bracketRepo } = build()

      // A retirement is a real outcome; refusing it would leave the draw stuck.
      await service.recordMatchResult('player-1', 'bm-1', {
        winner_registration_id: 'reg-1',
        scores: [{ set_number: 1, participant1_score: 0, participant2_score: 11 }]
      })

      expect(bracketRepo.update).toHaveBeenCalled()
    })

    it('refuses anyone who is not the event organiser', async () => {
      const { service } = build({ organizerId: 'someone-else' })

      await expect(service.recordMatchResult('player-1', 'bm-1', result)).rejects.toMatchObject({
        status: 403
      })
    })

    it('refuses when no match repository was supplied', async () => {
      const service = createBracketService(
        createFakeBracketRepository(),
        createFakeTournamentRepository(),
        createFakeRegistrationRepository(),
        createFakeEventRepository()
      )

      await expect(service.recordMatchResult('player-1', 'bm-1', result)).rejects.toMatchObject({
        status: 500
      })
    })
  })

  /**
   * Format moved onto the category in 031-tournament-format. Every one of these
   * would have passed before the move by reading the tournament's value, which
   * is exactly the bug: two categories of one weekend are routinely drawn
   * differently.
   */
  describe('per-category format', () => {
    function categoryRepo(format: TournamentFormat | null) {
      return {
        findById: vi.fn().mockResolvedValue({
          id: 'cat-1',
          tournament_id: 'tournament-1',
          template_id: null,
          name: '4.5',
          category_type: 'custom',
          min_rating: null,
          max_rating: null,
          max_participants: null,
          display_order: 0,
          status: 'open',
          match_type: 'singles',
          format,
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-01T00:00:00Z'
        }),
        findByTournamentId: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        listTemplates: vi.fn().mockResolvedValue([])
      } as unknown as TournamentCategoryRepository
    }

    async function generateWith(
      categoryFormat: TournamentFormat | null,
      tournamentFormat: TournamentFormat,
      entrantCount = 8
    ) {
      const event = makeEventRecord()
      const tournament = makeTournamentRecord({ status: 'open', format: tournamentFormat })
      const registrations = Array.from({ length: entrantCount }, (_, i) =>
        makeRegistrationRecord(`reg-${i + 1}`, `player-${i + 1}`, { category_id: 'cat-1' })
      )

      let created: BracketMatchRecord[] = []
      const service = createBracketService(
        createFakeBracketRepository({ createMany: captureInto((m) => (created = m)) }),
        createFakeTournamentRepository({ findById: vi.fn().mockResolvedValue(tournament) }),
        createFakeRegistrationRepository({
          findByTournamentIdWithPlayers: vi.fn().mockResolvedValue(registrations)
        }),
        createFakeEventRepository({ findById: vi.fn().mockResolvedValue(event) }),
        undefined,
        categoryRepo(categoryFormat)
      )

      await service.generateBracket('player-1', 'tournament-1', 'cat-1')
      return created
    }

    it("draws the CATEGORY's format, not the tournament's", async () => {
      // A round robin category inside a knockout tournament: everybody plays
      // everybody, so all 28 fixtures exist from the start.
      const created = await generateWith('round_robin', 'single_elimination')

      expect(created).toHaveLength(28)
      expect(created.every((m) => m.status === 'ready')).toBe(true)
    })

    it('falls back to the tournament when the category states no format', async () => {
      const created = await generateWith(null, 'round_robin')

      expect(created).toHaveLength(28)
      expect(created.every((m) => m.status === 'ready')).toBe(true)
    })

    it('draws pools, a playoff, a losers side and a grand final for RR -> double elim', async () => {
      const created = await generateWith('round_robin_double_elimination', 'single_elimination')

      const pools = created.filter((m) => m.round >= 10 && m.round < 50)
      const playoffs = created.filter((m) => m.round >= 50 && m.round < 100)
      const losers = created.filter((m) => m.round >= 100 && m.round < 200)
      const grandFinal = created.filter((m) => m.round === 200)

      // 8 entrants -> 2 pools of 4 -> 6 fixtures each.
      expect(pools).toHaveLength(12)
      expect(playoffs.length).toBeGreaterThan(0)
      expect(losers.length).toBeGreaterThan(0)
      expect(grandFinal).toHaveLength(1)
    })

    it('leaves the playoff slots empty until the pools decide them', async () => {
      const created = await generateWith('round_robin_double_elimination', 'single_elimination')
      const playoffs = created.filter((m) => m.round >= 50 && m.round < 100)

      expect(
        playoffs.every(
          (m) => m.participant1_registration_id === null && m.participant2_registration_id === null
        )
      ).toBe(true)
    })

    it('stamps every generated row with the category', async () => {
      const created = await generateWith('round_robin_single_elimination', 'single_elimination')

      expect(created.every((m) => m.category_id === 'cat-1')).toBe(true)
    })
  })

  /**
   * Advancement used to be gated on the tournament's format being an
   * elimination, so a staged format's playoff draw generated and then stayed a
   * column of TBDs forever: nothing ever joined the pools to the knockout.
   */
  describe('advancing through a staged format', () => {
    function buildAdvance(
      format: TournamentFormat,
      siblings: BracketMatchRecord[],
      decided: BracketMatchRecord
    ) {
      const bracketRepo = createFakeBracketRepository({
        findById: vi.fn().mockResolvedValue(decided),
        findByTournamentId: vi.fn().mockResolvedValue(siblings),
        update: vi.fn().mockImplementation((id, input) => {
          const target = siblings.find((m) => m.id === id) ?? decided
          Object.assign(target, input)
          return Promise.resolve(target)
        }),
        setParticipant: vi.fn().mockImplementation((id, slot, registrationId, status) => {
          const target = siblings.find((m) => m.id === id)!
          if (slot === 1) target.participant1_registration_id = registrationId
          else target.participant2_registration_id = registrationId
          target.status = status
          return Promise.resolve(target)
        })
      })

      const service = createBracketService(
        bracketRepo,
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeTournamentRecord({ format }))
        }),
        createFakeRegistrationRepository(),
        createFakeEventRepository({ findById: vi.fn().mockResolvedValue(makeEventRecord()) })
      )

      return { service, bracketRepo }
    }

    it('walks a playoff winner into the next playoff round', async () => {
      const decided = makeBracketMatchRecord({ id: 'p1', round: 51, position: 1 })
      const next = makeBracketMatchRecord({
        id: 'p3',
        round: 52,
        position: 1,
        participant1_registration_id: null,
        participant2_registration_id: null,
        status: 'pending'
      })
      const { service, bracketRepo } = buildAdvance(
        'round_robin_single_elimination',
        [decided, next],
        decided
      )

      await service.updateBracketMatch('player-1', 'p1', {
        winner_registration_id: 'reg-1',
        status: 'completed'
      })

      expect(bracketRepo.setParticipant).toHaveBeenCalledWith('p3', 1, 'reg-1', 'pending')
    })

    it('never advances a round robin, whose rounds are numbered like a knockout', async () => {
      const decided = makeBracketMatchRecord({ id: 'rr1', round: 1, position: 1 })
      const other = makeBracketMatchRecord({ id: 'rr2', round: 2, position: 1 })
      const { service, bracketRepo } = buildAdvance('round_robin', [decided, other], decided)

      await service.updateBracketMatch('player-1', 'rr1', {
        winner_registration_id: 'reg-1',
        status: 'completed'
      })

      // Round 2 of a round robin is another real fixture, not a slot to fill.
      expect(bracketRepo.setParticipant).not.toHaveBeenCalled()
    })

    it('holds the playoff empty while a single pool fixture is unplayed', async () => {
      const poolA1 = makeBracketMatchRecord({
        id: 'a1',
        round: 10,
        position: 1,
        status: 'completed',
        winner_registration_id: 'reg-1'
      })
      const poolA2 = makeBracketMatchRecord({ id: 'a2', round: 10, position: 2, status: 'ready' })
      const playoff = makeBracketMatchRecord({
        id: 'p1',
        round: 51,
        position: 1,
        participant1_registration_id: null,
        participant2_registration_id: null,
        status: 'pending'
      })
      const { service, bracketRepo } = buildAdvance(
        'round_robin_single_elimination',
        [poolA1, poolA2, playoff],
        poolA1
      )

      await service.updateBracketMatch('player-1', 'a1', {
        winner_registration_id: 'reg-1',
        status: 'completed'
      })

      expect(bracketRepo.setParticipant).not.toHaveBeenCalled()
    })

    it('seeds the playoff from the pool tables once the last fixture is decided', async () => {
      // Two pools of two. reg-1 wins Pool A, reg-3 wins Pool B.
      const poolA = makeBracketMatchRecord({
        id: 'a1',
        round: 10,
        position: 1,
        participant1_registration_id: 'reg-1',
        participant2_registration_id: 'reg-2',
        winner_registration_id: 'reg-1',
        status: 'completed'
      })
      const poolB = makeBracketMatchRecord({
        id: 'b1',
        round: 11,
        position: 1,
        participant1_registration_id: 'reg-3',
        participant2_registration_id: 'reg-4',
        winner_registration_id: 'reg-3',
        status: 'completed'
      })
      const playoff1 = makeBracketMatchRecord({
        id: 'p1',
        round: 51,
        position: 1,
        participant1_registration_id: null,
        participant2_registration_id: null,
        status: 'pending'
      })
      const playoff2 = makeBracketMatchRecord({
        id: 'p2',
        round: 51,
        position: 2,
        participant1_registration_id: null,
        participant2_registration_id: null,
        status: 'pending'
      })
      const { service, bracketRepo } = buildAdvance(
        'round_robin_single_elimination',
        [poolA, poolB, playoff1, playoff2],
        poolB
      )

      await service.updateBracketMatch('player-1', 'b1', {
        winner_registration_id: 'reg-3',
        status: 'completed'
      })

      const seeded = (bracketRepo.setParticipant as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[2]
      )
      // Both pool winners and both runners-up go through: four qualifiers into
      // a four-slot playoff.
      expect(new Set(seeded)).toEqual(new Set(['reg-1', 'reg-2', 'reg-3', 'reg-4']))
    })

    it('does not reseed a playoff that is already drawn', async () => {
      const poolA = makeBracketMatchRecord({
        id: 'a1',
        round: 10,
        position: 1,
        participant1_registration_id: 'reg-1',
        participant2_registration_id: 'reg-2',
        winner_registration_id: 'reg-1',
        status: 'completed'
      })
      const playoff = makeBracketMatchRecord({
        id: 'p1',
        round: 51,
        position: 1,
        participant1_registration_id: 'reg-1',
        participant2_registration_id: 'reg-2',
        status: 'ready'
      })
      const { service, bracketRepo } = buildAdvance(
        'round_robin_single_elimination',
        [poolA, playoff],
        poolA
      )

      // A correction to a finished group stage must not reshuffle a playoff
      // that may already be under way.
      await service.updateBracketMatch('player-1', 'a1', {
        winner_registration_id: 'reg-2',
        status: 'completed'
      })

      expect(bracketRepo.setParticipant).not.toHaveBeenCalled()
    })
  })
})
