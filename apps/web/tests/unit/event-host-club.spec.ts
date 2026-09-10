/**
 * Covers naming the hosting club on a search result.
 *
 * The event cards showed a venue and a town but never whose session it was, so
 * searchEvents now resolves the clubs behind a page of events. The cases worth
 * pinning are the ones about not lying or not being wasteful: one query for the
 * whole page, and an unresolvable club left unnamed rather than blank.
 */

import { describe, expect, it, vi } from 'vitest'
import { createEventService } from '../../server/domains/event/services/event.service'
import type { EventRecord } from '../../server/domains/event/dto/event.dto'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type { ClubRecord } from '../../server/domains/club/dto/club.dto'
import type { ClubRepository } from '../../server/domains/club/repositories/club.repository'
import type {
  TournamentRepository,
  TournamentRegistrationRepository
} from '../../server/domains/event/repositories/tournament.repository'

function makeEvent(id: string, clubId: string): EventRecord {
  return {
    id,
    club_id: clubId,
    name: `Event ${id}`,
    description: null,
    venue: null,
    province: null,
    city: null,
    start_date: '2026-09-01',
    end_date: '2026-09-01',
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
    updated_at: '2026-08-01T00:00:00Z'
  } as unknown as EventRecord
}

function makeClub(id: string, name: string, verified = false): ClubRecord {
  return {
    id,
    name,
    verification_status: verified ? 'verified' : 'unverified'
  } as unknown as ClubRecord
}

function serviceWith(records: EventRecord[], clubs: ClubRecord[]) {
  const findByIds = vi.fn(async (ids: string[]) => clubs.filter((c) => ids.includes(c.id)))
  const events = { search: async () => records } as unknown as EventRepository
  const clubRepo = { findByIds } as unknown as ClubRepository

  const service = createEventService(
    events,
    {} as TournamentRepository,
    {} as TournamentRegistrationRepository,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    clubRepo
  )
  return { service, findByIds }
}

describe('searchEvents host club', () => {
  it('names the hosting club on every result', async () => {
    const { service } = serviceWith(
      [makeEvent('e1', 'club-1'), makeEvent('e2', 'club-2')],
      [makeClub('club-1', 'Taguig Smashers'), makeClub('club-2', 'BGC Dinkers')]
    )

    const results = await service.searchEvents({ limit: 20, offset: 0 })

    expect(results.map((e) => e.club_name)).toEqual(['Taguig Smashers', 'BGC Dinkers'])
  })

  it('asks for the clubs once, not once per event', async () => {
    const { service, findByIds } = serviceWith(
      [makeEvent('e1', 'club-1'), makeEvent('e2', 'club-1'), makeEvent('e3', 'club-2')],
      [makeClub('club-1', 'Taguig Smashers'), makeClub('club-2', 'BGC Dinkers')]
    )

    await service.searchEvents({ limit: 20, offset: 0 })

    expect(findByIds).toHaveBeenCalledTimes(1)
  })

  it('leaves the field undefined when the club cannot be read', async () => {
    // RLS can withhold a club row; "unknown host" must not render as a blank one.
    const { service } = serviceWith([makeEvent('e1', 'club-hidden')], [])

    const [result] = await service.searchEvents({ limit: 20, offset: 0 })

    expect(result!.club_name).toBeUndefined()
  })

  it('does nothing when no club repository was supplied', async () => {
    const events = { search: async () => [makeEvent('e1', 'club-1')] } as unknown as EventRepository
    const service = createEventService(
      events,
      {} as TournamentRepository,
      {} as TournamentRegistrationRepository
    )

    const [result] = await service.searchEvents({ limit: 20, offset: 0 })

    expect(result!.club_name).toBeUndefined()
  })
})

describe('searchEvents host verification', () => {
  it('marks a verified host and leaves an unverified one unmarked', async () => {
    const { service } = serviceWith(
      [makeEvent('e1', 'club-1'), makeEvent('e2', 'club-2')],
      [makeClub('club-1', 'Taguig Smashers', true), makeClub('club-2', 'BGC Dinkers')]
    )

    const results = await service.searchEvents({ limit: 20, offset: 0 })

    expect(results.map((e) => e.club_verified)).toEqual([true, false])
  })
})
