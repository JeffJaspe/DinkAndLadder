/**
 * Covers how event capacity is counted and surfaced.
 *
 * The interesting cases are all about *not* lying: a withdrawal frees its slot,
 * an uncapped event has no slots to be remaining, and "not counted" is a
 * different fact from "nobody signed up".
 */

import { describe, expect, it, vi } from 'vitest'
import { SLOT_OCCUPYING_STATUSES } from '../../server/domains/event/dto/event.dto'
import { createEventService } from '../../server/domains/event/services/event.service'
import type { EventRecord } from '../../server/domains/event/dto/event.dto'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type { EventRegistrationRepository } from '../../server/domains/event/repositories/event-registration.repository'
import type { TournamentRepository, TournamentRegistrationRepository } from '../../server/domains/event/repositories/tournament.repository'

function makeEvent(overrides: Partial<EventRecord> & { id: string }): EventRecord {
  return {
    club_id: null,
    name: `Event ${overrides.id}`,
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
    event_type: 'open_ranked',
    fee_amount: null,
    fee_currency: null,
    max_participants: null,
    queue_enabled: false,
    queue_courts: 1,
    queue_mode: 'first_come',
    queue_skip_timeout_seconds: 120,
    affects_rating: true,
    created_by_player_id: 'organizer',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides
  } as EventRecord
}

const noopTournaments = {} as TournamentRepository
const noopRegistrations = {} as TournamentRegistrationRepository

function serviceWith(records: EventRecord[], countByEvents = vi.fn()) {
  const events = { search: async () => records } as unknown as EventRepository
  const eventRegistrations = { countByEvents } as unknown as EventRegistrationRepository
  return {
    service: createEventService(events, noopTournaments, noopRegistrations, undefined, eventRegistrations),
    countByEvents
  }
}

const query = { limit: 20, offset: 0 }

describe('event capacity', () => {
  it('counts only statuses that actually occupy a slot', () => {
    // A withdrawal frees the place back up. Counting it would show an event as
    // full when it is not.
    expect(SLOT_OCCUPYING_STATUSES).toEqual(['registered', 'checked_in'])
    expect(SLOT_OCCUPYING_STATUSES).not.toContain('withdrawn')
  })

  it('attaches the count to capped events', async () => {
    const { service } = serviceWith(
      [makeEvent({ id: 'e1', max_participants: 16 })],
      vi.fn().mockResolvedValue(new Map([['e1', 12]]))
    )

    const [event] = await service.searchEvents(query)

    expect(event!.registered_count).toBe(12)
    expect(event!.max_participants).toBe(16)
  })

  it('reports zero for a capped event nobody has joined', async () => {
    // Absent from the map means no registrations, which is a real 0 — not
    // "unknown". The card should say "16 of 16 slots left", not stay blank.
    const { service } = serviceWith(
      [makeEvent({ id: 'e1', max_participants: 16 })],
      vi.fn().mockResolvedValue(new Map())
    )

    const [event] = await service.searchEvents(query)

    expect(event!.registered_count).toBe(0)
  })

  it('does not query counts when no event declares a limit', async () => {
    // An uncapped event has no slots to be remaining, so the round trip would
    // buy nothing.
    const { service, countByEvents } = serviceWith([
      makeEvent({ id: 'e1', max_participants: null }),
      makeEvent({ id: 'e2', max_participants: null })
    ])

    const events = await service.searchEvents(query)

    expect(countByEvents).not.toHaveBeenCalled()
    expect(events[0]!.registered_count).toBeUndefined()
  })

  it('asks for every listed event in one call, not one per event', async () => {
    const countByEvents = vi.fn().mockResolvedValue(new Map())
    const { service } = serviceWith(
      [
        makeEvent({ id: 'e1', max_participants: 8 }),
        makeEvent({ id: 'e2', max_participants: 16 }),
        makeEvent({ id: 'e3', max_participants: null })
      ],
      countByEvents
    )

    await service.searchEvents(query)

    expect(countByEvents).toHaveBeenCalledTimes(1)
    expect(countByEvents).toHaveBeenCalledWith(['e1', 'e2', 'e3'], SLOT_OCCUPYING_STATUSES)
  })

  it('leaves the count undefined when no registration repository is supplied', async () => {
    // Every other caller of this service constructs it without the repository;
    // they must keep working, and undefined must not become 0.
    const events = { search: async () => [makeEvent({ id: 'e1', max_participants: 16 })] } as unknown as EventRepository
    const service = createEventService(events, noopTournaments, noopRegistrations)

    const [event] = await service.searchEvents(query)

    expect(event!.registered_count).toBeUndefined()
  })
})
