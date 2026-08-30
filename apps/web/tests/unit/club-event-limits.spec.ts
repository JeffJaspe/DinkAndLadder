import { describe, expect, it, vi } from 'vitest'
import {
  createEventService,
  EventServiceError
} from '../../server/domains/event/services/event.service'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type { EventRecord } from '../../server/domains/event/dto/event.dto'

/**
 * What an unverified club may have running at once.
 *
 * Nothing limited this before, so verification — which has a full approval flow
 * already built — bought a club nothing. These limits are what make the tier
 * mean something: one live tournament, one live open play, one draft.
 */

/** A tournament event auto-creates its one tournament, so the fake needs create. */
function tournamentRepoFake() {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByEventId: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 't-1', event_id: 'event-1' }),
    update: vi.fn(),
    updateStatus: vi.fn(),
    setBracketLock: vi.fn()
  }
}

const CLUB = 'club-1'
const ORGANISER = 'player-1'

function eventRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'event-1',
    club_id: CLUB,
    name: 'Weekend Open',
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
    event_type: 'tournament',
    fee_amount: null,
    fee_currency: null,
    max_participants: null,
    queue_enabled: false,
    queue_courts: 1,
    queue_mode: 'first_come',
    queue_skip_timeout_seconds: 120,
    created_by_player_id: ORGANISER,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides
  } as EventRecord
}

function serviceFor(options: {
  verified?: boolean
  counts?: { drafts: number; liveTournaments: number; liveOpenPlay: number }
  event?: EventRecord
}) {
  const record = options.event ?? eventRecord()
  const events = {
    findById: vi.fn().mockResolvedValue(record),
    create: vi.fn().mockResolvedValue(record),
    update: vi.fn().mockResolvedValue(record),
    updateStatus: vi.fn().mockResolvedValue({ ...record, status: 'published' }),
    search: vi.fn().mockResolvedValue([]),
    countBlockingChildren: vi
      .fn()
      .mockResolvedValue({ registrations: 0, matches: 0, queueEntries: 0 }),
    deleteWithChildren: vi.fn(),
    countByClubForLimits: vi
      .fn()
      .mockResolvedValue(options.counts ?? { drafts: 0, liveTournaments: 0, liveOpenPlay: 0 })
  } as unknown as EventRepository

  const memberships = {
    findByClubAndPlayer: vi.fn().mockResolvedValue({
      id: 'm-1',
      club_id: CLUB,
      player_id: ORGANISER,
      role: 'OWNER',
      status: 'active'
    })
  }

  const clubs = {
    findById: vi.fn().mockResolvedValue({
      id: CLUB,
      verification_status: options.verified ? 'verified' : 'unverified'
    })
  }

  const service = createEventService(
    events,
    tournamentRepoFake() as never,
    { findCategoryEntrants: vi.fn().mockResolvedValue([]) } as never,
    memberships as never,
    undefined,
    undefined,
    undefined,
    undefined,
    clubs as never
  )

  return { service, events }
}

const CREATE_INPUT = {
  club_id: CLUB,
  name: 'Weekend Open',
  start_date: '2026-09-01',
  end_date: '2026-09-02',
  event_type: 'tournament' as const
}

describe('draft allowance', () => {
  it('lets an unverified club keep one draft', async () => {
    const { service } = serviceFor({ counts: { drafts: 0, liveTournaments: 0, liveOpenPlay: 0 } })
    await expect(service.createEvent(ORGANISER, { ...CREATE_INPUT })).resolves.toBeDefined()
  })

  it('refuses a second draft, naming the way out', async () => {
    const { service } = serviceFor({ counts: { drafts: 1, liveTournaments: 0, liveOpenPlay: 0 } })

    await expect(service.createEvent(ORGANISER, { ...CREATE_INPUT })).rejects.toMatchObject({
      code: 'CLUB_DRAFT_LIMIT'
    })
  })

  it('lets a verified club keep as many as it likes', async () => {
    const { service } = serviceFor({
      verified: true,
      counts: { drafts: 9, liveTournaments: 3, liveOpenPlay: 4 }
    })

    await expect(service.createEvent(ORGANISER, { ...CREATE_INPUT })).resolves.toBeDefined()
  })
})

describe('live event allowance', () => {
  it('lets an unverified club publish its first tournament', async () => {
    const { service } = serviceFor({ counts: { drafts: 1, liveTournaments: 0, liveOpenPlay: 0 } })
    await expect(service.publishEvent(ORGANISER, 'event-1')).resolves.toBeDefined()
  })

  it('refuses a second live tournament', async () => {
    const { service } = serviceFor({ counts: { drafts: 1, liveTournaments: 1, liveOpenPlay: 0 } })

    await expect(service.publishEvent(ORGANISER, 'event-1')).rejects.toMatchObject({
      code: 'CLUB_EVENT_LIMIT'
    })
  })

  /**
   * The two types are counted separately: running a tournament must not stop a
   * club also running its regular weekly open play.
   */
  it('counts tournaments and open play separately', async () => {
    const { service } = serviceFor({
      counts: { drafts: 1, liveTournaments: 0, liveOpenPlay: 1 },
      event: eventRecord({ event_type: 'tournament' })
    })

    await expect(service.publishEvent(ORGANISER, 'event-1')).resolves.toBeDefined()
  })

  it('refuses a second live open play', async () => {
    const { service } = serviceFor({
      counts: { drafts: 1, liveTournaments: 1, liveOpenPlay: 1 },
      event: eventRecord({ event_type: 'open_ranked' })
    })

    await expect(service.publishEvent(ORGANISER, 'event-1')).rejects.toMatchObject({
      code: 'CLUB_EVENT_LIMIT'
    })
  })

  it('does not limit a verified club', async () => {
    const { service } = serviceFor({
      verified: true,
      counts: { drafts: 5, liveTournaments: 5, liveOpenPlay: 5 }
    })

    await expect(service.publishEvent(ORGANISER, 'event-1')).resolves.toBeDefined()
  })
})

describe('when the club repository was not supplied', () => {
  it('applies no limit, rather than failing closed', async () => {
    // Same degradation as `memberships` and `categories`: a caller that did not
    // wire it keeps the behaviour it had.
    const events = {
      findById: vi.fn().mockResolvedValue(eventRecord()),
      create: vi.fn().mockResolvedValue(eventRecord()),
      update: vi.fn().mockResolvedValue(eventRecord()),
      updateStatus: vi.fn(),
      search: vi.fn(),
      countBlockingChildren: vi.fn(),
      deleteWithChildren: vi.fn(),
      countByClubForLimits: vi.fn()
    } as unknown as EventRepository

    const service = createEventService(
      events,
      tournamentRepoFake() as never,
      { findCategoryEntrants: vi.fn().mockResolvedValue([]) } as never,
      {
        findByClubAndPlayer: vi.fn().mockResolvedValue({ role: 'OWNER', status: 'active' })
      } as never
    )

    await expect(service.createEvent(ORGANISER, { ...CREATE_INPUT })).resolves.toBeDefined()
    expect(events.countByClubForLimits).not.toHaveBeenCalled()
  })
})

describe('EventServiceError shape', () => {
  it('reports the limits as 409 conflicts', async () => {
    const { service } = serviceFor({ counts: { drafts: 1, liveTournaments: 0, liveOpenPlay: 0 } })

    await expect(service.createEvent(ORGANISER, { ...CREATE_INPUT })).rejects.toBeInstanceOf(
      EventServiceError
    )
    await expect(service.createEvent(ORGANISER, { ...CREATE_INPUT })).rejects.toMatchObject({
      status: 409
    })
  })
})
