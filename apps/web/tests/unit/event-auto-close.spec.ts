/**
 * Covers closing an open-play session the organiser forgot to close.
 *
 * The rule is a deadline, so the cases that matter are the ones either side of
 * it: a session still inside its grace period must be left alone (somebody may
 * be about to close it themselves), and one past it must be closed exactly
 * once. A tournament is never swept — it ends by being completed, not closed.
 */

import { describe, expect, it, vi } from 'vitest'
import { createEventService } from '../../server/domains/event/services/event.service'
import { staleOpenPlayDeadline } from '../../server/domains/event/dto/event.dto'
import type { EventRecord } from '../../server/domains/event/dto/event.dto'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type {
  TournamentRegistrationRepository,
  TournamentRepository
} from '../../server/domains/event/repositories/tournament.repository'

function makeEvent(overrides: Partial<EventRecord> & { id: string }): EventRecord {
  return {
    club_id: 'club-1',
    name: `Session ${overrides.id}`,
    description: null,
    venue: null,
    province: null,
    city: null,
    start_date: '2026-09-01',
    end_date: '2026-09-01',
    start_time: '18:00',
    end_time: '21:00',
    registration_opens: null,
    registration_closes: null,
    status: 'active',
    visibility: 'public',
    event_type: 'open_casual',
    fee_amount: null,
    fee_currency: null,
    max_participants: null,
    queue_enabled: true,
    queue_courts: 2,
    queue_mode: 'first_come',
    queue_rotation: false,
    match_format: 'doubles',
    min_players_to_start: null,
    close_policy: 'manual',
    closes_at: null,
    closed_at: null,
    restricted_at: null,
    restricted_reason: null,
    coach_player_id: null,
    fee_payer: 'player',
    organizer_fee_amount: null,
    queue_skip_timeout_seconds: 120,
    created_by_player_id: 'organizer',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides
  } as EventRecord
}

function serviceWith(records: EventRecord[]) {
  const update = vi.fn(async (id: string, patch: Record<string, unknown>) => ({
    ...records.find((r) => r.id === id)!,
    ...patch
  }))
  const findOpenPlayAwaitingClose = vi.fn(async () => records)
  const events = { findOpenPlayAwaitingClose, update } as unknown as EventRepository

  return {
    service: createEventService(
      events,
      {} as TournamentRepository,
      {} as TournamentRegistrationRepository
    ),
    update,
    findOpenPlayAwaitingClose
  }
}

describe('staleOpenPlayDeadline', () => {
  it('runs the grace period from the session end time', () => {
    const deadline = staleOpenPlayDeadline({ end_date: '2026-09-01', end_time: '21:00' }, 12)
    expect(deadline.toISOString()).toBe('2026-09-02T09:00:00.000Z')
  })

  it('runs it from the end of the day when no end time was given', () => {
    // "We do not know when it finished" must not be read as midnight, which
    // would make an evening session stale before the evening was over.
    const deadline = staleOpenPlayDeadline({ end_date: '2026-09-01', end_time: null }, 12)
    expect(deadline.toISOString()).toBe('2026-09-02T11:59:00.000Z')
  })
})

describe('autoCloseStaleOpenPlay', () => {
  it('closes a session past its grace period', async () => {
    const { service, update } = serviceWith([makeEvent({ id: 'e1' })])
    const now = new Date('2026-09-02T10:00:00Z')

    const closed = await service.autoCloseStaleOpenPlay({ now })

    expect(closed.map((e) => e.id)).toEqual(['e1'])
    expect(update).toHaveBeenCalledWith('e1', { closed_at: now.toISOString() })
  })

  it('leaves a session that is still inside its grace period alone', async () => {
    const { service, update } = serviceWith([makeEvent({ id: 'e1' })])

    const closed = await service.autoCloseStaleOpenPlay({
      now: new Date('2026-09-02T08:59:00Z')
    })

    expect(closed).toEqual([])
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps going when one row fails', async () => {
    const { service, update } = serviceWith([makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })])
    update.mockRejectedValueOnce(new Error('lost a race with the organiser'))

    const closed = await service.autoCloseStaleOpenPlay({ now: new Date('2026-09-02T10:00:00Z') })

    expect(closed.map((e) => e.id)).toEqual(['e2'])
  })

  it('asks only as far back as the grace period reaches', async () => {
    const { service, findOpenPlayAwaitingClose } = serviceWith([])

    await service.autoCloseStaleOpenPlay({ now: new Date('2026-09-02T10:00:00Z'), graceHours: 12 })

    expect(findOpenPlayAwaitingClose).toHaveBeenCalledWith('2026-09-01', 100)
  })
})
