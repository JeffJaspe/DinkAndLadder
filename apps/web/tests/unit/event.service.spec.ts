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
import { SLOT_HOLDING_REGISTRATION_STATUSES } from '../../server/domains/event/dto/tournament.dto'

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
    start_time: null,
    end_time: null,
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
    match_format: 'doubles',
    queue_mode: 'first_come',
    min_players_to_start: null,
    close_policy: 'manual',
    closes_at: null,
    closed_at: null,
    coach_player_id: null,
    fee_payer: 'player',
    organizer_fee_amount: null,
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
    bracket_locked_at: null,
    bracket_locked_by_player_id: null,
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

    // 028-event-time: the times are wall-clock `time` columns, so ordering can
    // only be judged inside a single day. chk_event_time_order backs this up in
    // the database; the service exists so the caller gets a 400 with a sentence
    // rather than a constraint violation.
    it('rejects an end time before the start time on a single-day event', async () => {
      const service = createEventService(
        createFakeEventRepository({ create: vi.fn().mockResolvedValue(makeEventRecord()) }),
        createFakeTournamentRepository(),
        createFakeRegistrationRepository(),
        createFakeMembershipRepository()
      )

      await expect(
        service.createEvent('player-1', {
          club_id: 'club-1',
          name: 'Evening Session',
          start_date: '2026-09-01',
          end_date: '2026-09-01',
          start_time: '20:00',
          end_time: '18:00',
          event_type: 'open_ranked'
        })
      ).rejects.toThrow(/end time must be after the start time/i)
    })

    it('rejects an end time equal to the start time', async () => {
      const service = createEventService(
        createFakeEventRepository({ create: vi.fn().mockResolvedValue(makeEventRecord()) }),
        createFakeTournamentRepository(),
        createFakeRegistrationRepository(),
        createFakeMembershipRepository()
      )

      await expect(
        service.createEvent('player-1', {
          club_id: 'club-1',
          name: 'Zero Length',
          start_date: '2026-09-01',
          end_date: '2026-09-01',
          start_time: '18:00',
          end_time: '18:00',
          event_type: 'open_ranked'
        })
      ).rejects.toThrow(EventServiceError)
    })

    // A Friday-evening-to-Saturday-morning event is ordered correctly even
    // though 11:00 reads as earlier than 18:00 — the dates differ, so the clock
    // comparison must not run at all.
    it('allows an earlier end time when the event spans more than one day', async () => {
      const eventRepo = createFakeEventRepository({
        create: vi
          .fn()
          .mockResolvedValue(makeEventRecord({ start_time: '18:00', end_time: '11:00' }))
      })
      const service = createEventService(
        eventRepo,
        createFakeTournamentRepository(),
        createFakeRegistrationRepository(),
        createFakeMembershipRepository()
      )

      const result = await service.createEvent('player-1', {
        club_id: 'club-1',
        name: 'Overnighter',
        start_date: '2026-09-01',
        end_date: '2026-09-02',
        start_time: '18:00',
        end_time: '11:00',
        event_type: 'open_ranked'
      })

      expect(result.start_time).toBe('18:00')
      expect(result.end_time).toBe('11:00')
    })

    it('rejects a malformed time', async () => {
      const service = createEventService(
        createFakeEventRepository({ create: vi.fn().mockResolvedValue(makeEventRecord()) }),
        createFakeTournamentRepository(),
        createFakeRegistrationRepository(),
        createFakeMembershipRepository()
      )

      await expect(
        service.createEvent('player-1', {
          club_id: 'club-1',
          name: 'Nonsense',
          start_date: '2026-09-01',
          end_date: '2026-09-01',
          start_time: '6pm',
          event_type: 'open_ranked'
        })
      ).rejects.toThrow(/24-hour clock/i)
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
      const tournamentRepo = createFakeTournamentRepository({
        findById: vi.fn().mockResolvedValue(tournament)
      })
      const registrationRepo = createFakeRegistrationRepository({
        findCategoryEntrants: vi.fn().mockResolvedValue([
          {
            registration_id: 'reg-1',
            player_id: 'player-1',
            as_partner: false,
            paired_with_player_id: null
          }
        ])
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

  /**
   * One entry per person per category — as the registrant OR as a partner.
   *
   * A doubles entry is one row carrying two people, and the old check read
   * `player_id` alone, so a named partner was invisible to it: they could enter
   * again in their own right, or be named by a second pair, and the generator
   * would seed the same person into two slots of one draw.
   */
  describe('register — one entry per person per category', () => {
    const CATEGORY = 'category-1'

    function entrant(playerId: string, asPartner: boolean, pairedWith: string | null) {
      return {
        registration_id: 'reg-existing',
        player_id: playerId,
        as_partner: asPartner,
        paired_with_player_id: pairedWith
      }
    }

    function serviceWith(
      entrants: ReturnType<typeof entrant>[],
      categoryOverrides?: Record<string, unknown>
    ) {
      const registrationRepo = createFakeRegistrationRepository({
        findCategoryEntrants: vi.fn().mockResolvedValue(entrants),
        create: vi.fn().mockResolvedValue(makeRegistrationRecord())
      })
      const categoryRepo = {
        findById: vi.fn().mockResolvedValue({
          id: CATEGORY,
          tournament_id: 'tournament-1',
          match_type: 'doubles',
          format: null,
          min_rating: null,
          max_rating: null,
          max_participants: null,
          status: 'open',
          ...categoryOverrides
        }),
        findByTournamentId: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        listTemplates: vi.fn().mockResolvedValue([])
      }
      const partnershipRepo = {
        findPartnershipBetween: vi.fn().mockResolvedValue({ id: 'p-1' })
      }

      const service = createEventService(
        createFakeEventRepository(),
        createFakeTournamentRepository({
          findById: vi
            .fn()
            .mockResolvedValue(makeTournamentRecord({ status: 'open', match_type: 'doubles' }))
        }),
        registrationRepo,
        undefined,
        undefined,
        categoryRepo as never,
        partnershipRepo as never
      )
      return { service, registrationRepo }
    }

    // The four rows of the invariant table.

    it('refuses a registrant who is already in as a registrant', async () => {
      const { service } = serviceWith([entrant('player-1', false, 'player-9')])
      await expect(
        service.register('player-1', 'tournament-1', 'player-2', CATEGORY)
      ).rejects.toMatchObject({ code: 'ALREADY_IN_CATEGORY' })
    })

    it('refuses a registrant who is already in as somebody else’s partner', async () => {
      const { service } = serviceWith([entrant('player-1', true, 'player-9')])
      await expect(
        service.register('player-1', 'tournament-1', 'player-2', CATEGORY)
      ).rejects.toMatchObject({ code: 'ALREADY_IN_CATEGORY' })
    })

    it('refuses a partner who is already in as a registrant', async () => {
      // The exact reported case: Elbuff enters alone, then is named as a
      // partner by ronahbiejacobjaspe, and the draw seeds Elbuff twice.
      const { service } = serviceWith([entrant('player-2', false, null)])
      await expect(
        service.register('player-1', 'tournament-1', 'player-2', CATEGORY)
      ).rejects.toMatchObject({ code: 'PARTNER_ALREADY_IN_CATEGORY' })
    })

    it('refuses a partner who is already in as another pair’s partner', async () => {
      const { service } = serviceWith([entrant('player-2', true, 'player-9')])
      await expect(
        service.register('player-1', 'tournament-1', 'player-2', CATEGORY)
      ).rejects.toMatchObject({ code: 'PARTNER_ALREADY_IN_CATEGORY' })
    })

    it('admits a pair when neither of them is in the category', async () => {
      const { service, registrationRepo } = serviceWith([entrant('player-9', false, 'player-8')])
      await service.register('player-1', 'tournament-1', 'player-2', CATEGORY)
      expect(registrationRepo.create).toHaveBeenCalledWith(
        'tournament-1',
        'player-1',
        'player-2',
        CATEGORY
      )
    })

    it('scopes the check to the category, so a second category stays open', async () => {
      // findCategoryEntrants is asked about ONE category; the 3.5 Singles being
      // full of these players says nothing about the 3.5 Doubles.
      const { service, registrationRepo } = serviceWith([])
      await service.register('player-1', 'tournament-1', 'player-2', CATEGORY)
      expect(registrationRepo.findCategoryEntrants).toHaveBeenCalledWith('tournament-1', CATEGORY)
    })

    /**
     * The repository is what decides which statuses hold a slot, and getting
     * `rejected` wrong would leave a turned-away entry blocking its own players
     * forever — and stop an organiser rejecting one half of a duplicate pair,
     * which is the cleanup the invariant exists to enable.
     */
    it('asks only for slot-holding statuses, so rejected entries free their place', async () => {
      const { service, registrationRepo } = serviceWith([])
      await service.register('player-1', 'tournament-1', 'player-2', CATEGORY)

      // The fake records the call; the real query filters on this list.
      expect(SLOT_HOLDING_REGISTRATION_STATUSES).toEqual(['pending', 'confirmed', 'waitlisted'])
      expect(SLOT_HOLDING_REGISTRATION_STATUSES).not.toContain('rejected')
      expect(SLOT_HOLDING_REGISTRATION_STATUSES).not.toContain('withdrawn')
      expect(registrationRepo.findCategoryEntrants).toHaveBeenCalled()
    })

    it('refuses entering as your own partner', async () => {
      const { service } = serviceWith([])
      await expect(
        service.register('player-1', 'tournament-1', 'player-1', CATEGORY)
      ).rejects.toMatchObject({ code: 'SELF_PARTNER' })
    })

    it('refuses a partner who never agreed to be one', async () => {
      const registrationRepo = createFakeRegistrationRepository({
        findCategoryEntrants: vi.fn().mockResolvedValue([])
      })
      const service = createEventService(
        createFakeEventRepository(),
        createFakeTournamentRepository({
          findById: vi
            .fn()
            .mockResolvedValue(makeTournamentRecord({ status: 'open', match_type: 'doubles' }))
        }),
        registrationRepo,
        undefined,
        undefined,
        undefined,
        { findPartnershipBetween: vi.fn().mockResolvedValue(null) } as never
      )

      await expect(
        service.register('player-1', 'tournament-1', 'stranger', null)
      ).rejects.toMatchObject({ code: 'NOT_A_PARTNER' })
    })

    it('enforces the CATEGORY’s capacity, counting a pair as one entry', async () => {
      const { service } = serviceWith(
        // Two people, one entry — a doubles pair occupying a single slot.
        [entrant('player-8', false, 'player-9'), entrant('player-9', true, 'player-8')],
        { max_participants: 1 }
      )
      await expect(
        service.register('player-1', 'tournament-1', 'player-2', CATEGORY)
      ).rejects.toMatchObject({ code: 'CATEGORY_FULL' })
    })

    it('maps the DB trigger’s race rejection onto the same 409', async () => {
      const registrationRepo = createFakeRegistrationRepository({
        findCategoryEntrants: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue(
          Object.assign(new Error('ONE_ENTRY_PER_CATEGORY: Ana Cruz is already entered'), {
            code: '23505'
          })
        )
      })
      const service = createEventService(
        createFakeEventRepository(),
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeTournamentRecord({ status: 'open' }))
        }),
        registrationRepo
      )

      await expect(service.register('player-1', 'tournament-1', null, null)).rejects.toMatchObject({
        status: 409,
        code: 'ALREADY_IN_CATEGORY'
      })
    })

    it('lets an unrelated DB error through rather than calling it a duplicate', async () => {
      const registrationRepo = createFakeRegistrationRepository({
        findCategoryEntrants: vi.fn().mockResolvedValue([]),
        create: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error('some other unique index'), { code: '23505' }))
      })
      const service = createEventService(
        createFakeEventRepository(),
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeTournamentRecord({ status: 'open' }))
        }),
        registrationRepo
      )

      await expect(
        service.register('player-1', 'tournament-1', null, null)
      ).rejects.not.toBeInstanceOf(EventServiceError)
    })
  })

  describe('register — category rating band', () => {
    function serviceFor(
      band: { min_rating: number | null; max_rating: number | null },
      ratingValue: number | null
    ) {
      return createEventService(
        createFakeEventRepository(),
        createFakeTournamentRepository({
          findById: vi.fn().mockResolvedValue(makeTournamentRecord({ status: 'open' }))
        }),
        createFakeRegistrationRepository({
          findCategoryEntrants: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue(makeRegistrationRecord())
        }),
        undefined,
        undefined,
        {
          findById: vi.fn().mockResolvedValue({
            id: 'category-1',
            tournament_id: 'tournament-1',
            match_type: 'singles',
            format: null,
            max_participants: null,
            status: 'open',
            ...band
          }),
          findByTournamentId: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn(),
          listTemplates: vi.fn().mockResolvedValue([])
        } as never,
        undefined,
        {
          getRating: vi
            .fn()
            .mockResolvedValue(ratingValue == null ? null : { rating_value: ratingValue })
        } as never
      )
    }

    it('admits a rating inside the band', async () => {
      const service = serviceFor({ min_rating: 3.0, max_rating: 3.5 }, 3.2)
      await expect(
        service.register('player-1', 'tournament-1', null, 'category-1')
      ).resolves.toBeDefined()
    })

    it('refuses a rating above the band', async () => {
      const service = serviceFor({ min_rating: 3.0, max_rating: 3.5 }, 3.55)
      await expect(
        service.register('player-1', 'tournament-1', null, 'category-1')
      ).rejects.toMatchObject({ code: 'RATING_OUT_OF_BAND' })
    })

    it('admits a rating that rounds back into the band', async () => {
      // 3.549 rounds to 3.5, which is the top of this band. Without the
      // rounding rule this player belongs to no band on the whole ladder.
      const service = serviceFor({ min_rating: 3.0, max_rating: 3.5 }, 3.549)
      await expect(
        service.register('player-1', 'tournament-1', null, 'category-1')
      ).resolves.toBeDefined()
    })

    it('refuses an unrated player from a banded category', async () => {
      const service = serviceFor({ min_rating: 3.0, max_rating: 3.5 }, null)
      await expect(
        service.register('player-1', 'tournament-1', null, 'category-1')
      ).rejects.toMatchObject({ code: 'RATING_OUT_OF_BAND' })
    })

    it('admits anyone to a category with no band', async () => {
      const service = serviceFor({ min_rating: null, max_rating: null }, null)
      await expect(
        service.register('player-1', 'tournament-1', null, 'category-1')
      ).resolves.toBeDefined()
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

  /**
   * A tournament event owns exactly one tournament, created with it.
   *
   * The organiser used to build that middle level by hand through an "Add
   * Tournament" screen, which is what made an event read as a folder of
   * tournaments that were themselves folders of categories.
   */
  describe('tournament auto-creation', () => {
    function serviceFor(eventRecord: EventRecord, tournamentRepo: TournamentRepository) {
      return createEventService(
        createFakeEventRepository({
          create: vi.fn().mockResolvedValue(eventRecord),
          update: vi.fn().mockResolvedValue(eventRecord),
          findById: vi.fn().mockResolvedValue(eventRecord)
        }),
        tournamentRepo,
        createFakeRegistrationRepository(),
        createFakeMembershipRepository()
      )
    }

    const baseInput = {
      club_id: 'club-1',
      name: 'Test Event',
      start_date: '2026-09-01',
      end_date: '2026-09-02'
    }

    it('creates one tournament for a tournament event', async () => {
      const tournamentRepo = createFakeTournamentRepository()
      const service = serviceFor(makeEventRecord({ event_type: 'tournament' }), tournamentRepo)

      await service.createEvent('player-1', {
        ...baseInput,
        event_type: 'tournament',
        tournament_format: 'round_robin',
        tournament_match_type: 'singles'
      })

      expect(tournamentRepo.create).toHaveBeenCalledTimes(1)
      expect(tournamentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 'event-1',
          name: 'Test Event',
          format: 'round_robin',
          match_type: 'singles'
        })
      )
    })

    it('falls back to sensible defaults when the format is not given', async () => {
      const tournamentRepo = createFakeTournamentRepository()
      const service = serviceFor(makeEventRecord({ event_type: 'tournament' }), tournamentRepo)

      await service.createEvent('player-1', { ...baseInput, event_type: 'tournament' })

      expect(tournamentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'single_elimination',
          match_type: 'doubles'
        })
      )
    })

    it('creates no tournament for other event types', async () => {
      const tournamentRepo = createFakeTournamentRepository()
      const service = serviceFor(makeEventRecord({ event_type: 'open_ranked' }), tournamentRepo)

      await service.createEvent('player-1', { ...baseInput, event_type: 'open_ranked' })

      expect(tournamentRepo.create).not.toHaveBeenCalled()
    })

    it('never creates a second tournament for an event that has one', async () => {
      const tournamentRepo = createFakeTournamentRepository({
        findByEventId: vi.fn().mockResolvedValue([{ id: 'tournament-1' }])
      })
      const service = serviceFor(makeEventRecord({ event_type: 'tournament' }), tournamentRepo)

      await service.createEvent('player-1', { ...baseInput, event_type: 'tournament' })

      expect(tournamentRepo.create).not.toHaveBeenCalled()
    })

    it('creates one when an existing event is switched to a tournament', async () => {
      const tournamentRepo = createFakeTournamentRepository()
      const service = serviceFor(makeEventRecord({ event_type: 'tournament' }), tournamentRepo)

      await service.updateEvent('player-1', 'event-1', { event_type: 'tournament' })

      expect(tournamentRepo.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('getPrimaryTournament', () => {
    it('returns the first tournament of the event', async () => {
      const service = createEventService(
        createFakeEventRepository(),
        createFakeTournamentRepository({
          findByEventId: vi.fn().mockResolvedValue([
            {
              id: 'tournament-1',
              event_id: 'event-1',
              name: 'Summer Open',
              format: 'single_elimination',
              match_type: 'doubles',
              min_rating: null,
              max_rating: null,
              max_participants: null,
              status: 'open',
              bracket_locked_at: null,
              bracket_locked_by_player_id: null,
              created_at: '2026-08-01T00:00:00Z',
              updated_at: '2026-08-01T00:00:00Z'
            }
          ])
        }),
        createFakeRegistrationRepository(),
        createFakeMembershipRepository()
      )

      const result = await service.getPrimaryTournament('event-1')
      expect(result?.id).toBe('tournament-1')
    })

    it('returns null when the event has none', async () => {
      const service = createEventService(
        createFakeEventRepository(),
        createFakeTournamentRepository(),
        createFakeRegistrationRepository(),
        createFakeMembershipRepository()
      )

      await expect(service.getPrimaryTournament('event-1')).resolves.toBeNull()
    })
  })
})
