import { describe, it, expect, vi } from 'vitest'
import { createEventCoOrganizerService } from '../../server/domains/event/services/event-co-organizer.service'
import type { EventCoOrganizerRepository } from '../../server/domains/event/repositories/event-co-organizer.repository'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type { EventCoOrganizerRecord } from '../../server/domains/event/dto/event-co-organizer.dto'
import { createFriendsService } from '../../server/domains/partnership/services/friends.service'
import type { PartnershipRepository } from '../../server/domains/partnership/repositories/partnership.repository'
import type { TeamUpRepository } from '../../server/domains/partnership/repositories/team-up.repository'

const CREATOR = 'creator-1'
const FRIEND = 'friend-1'
const STRANGER = 'stranger-1'
const EVENT = 'event-1'

function fakeEvents(): EventRepository {
  return {
    findById: vi.fn(async (id: string) =>
      id === EVENT ? ({ id, created_by_player_id: CREATOR } as never) : null
    )
  } as unknown as EventRepository
}

function fakeCoOrganizers(): EventCoOrganizerRepository & { rows: EventCoOrganizerRecord[] } {
  const rows: EventCoOrganizerRecord[] = []
  return {
    rows,
    listByEvent: vi.fn(async (eventId) => rows.filter((r) => r.event_id === eventId)),
    listEventIdsByPlayer: vi.fn(async (playerId) =>
      rows.filter((r) => r.player_id === playerId).map((r) => r.event_id)
    ),
    isCoOrganizer: vi.fn(
      async (eventId, playerId) =>
        !!rows.find((r) => r.event_id === eventId && r.player_id === playerId)
    ),
    add: vi.fn(async (event_id, player_id, added_by_player_id) => {
      const row = {
        id: `co-${rows.length + 1}`,
        event_id,
        player_id,
        added_by_player_id,
        created_at: '2026-09-14T00:00:00Z'
      }
      rows.push(row)
      return row
    }),
    remove: vi.fn(async (eventId, playerId) => {
      const i = rows.findIndex((r) => r.event_id === eventId && r.player_id === playerId)
      if (i >= 0) rows.splice(i, 1)
    })
  }
}

/** Friends: CREATOR ↔ FRIEND are duo partners; nobody else is anything. */
function friends() {
  const partnerships = {
    findPartners: vi.fn(async (playerId: string) =>
      playerId === CREATOR || playerId === FRIEND
        ? [{ id: 'p1', player1_id: CREATOR, player2_id: FRIEND, created_at: '' }]
        : []
    )
  } as unknown as PartnershipRepository
  const teamUps = {
    findAcceptedPeerIds: vi.fn(async () => [])
  } as unknown as TeamUpRepository
  return createFriendsService(partnerships, teamUps)
}

function build() {
  const repo = fakeCoOrganizers()
  const service = createEventCoOrganizerService(fakeEvents(), repo, friends())
  return { repo, service }
}

describe('EventCoOrganizerService', () => {
  it('lets the creator appoint a friend, and then counts them as an organiser', async () => {
    const { service } = build()
    await service.add(CREATOR, EVENT, FRIEND)
    expect(await service.isOrganizer(EVENT, FRIEND)).toBe(true)
    expect(await service.isOrganizer(EVENT, CREATOR)).toBe(true)
    expect(await service.isOrganizer(EVENT, STRANGER)).toBe(false)
  })

  it('refuses anyone who is not a friend', async () => {
    const { service } = build()
    await expect(service.add(CREATOR, EVENT, STRANGER)).rejects.toMatchObject({
      status: 403,
      code: 'NOT_A_FRIEND'
    })
  })

  it('refuses a co-organiser who tries to appoint someone', async () => {
    const { service } = build()
    await service.add(CREATOR, EVENT, FRIEND)
    // FRIEND is now an organiser, but not the creator — and STRANGER is not
    // even FRIEND's friend, so both rules would refuse; the creator rule fires
    // first because it is the one that never depends on who is being added.
    await expect(service.add(FRIEND, EVENT, STRANGER)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN'
    })
  })

  it('refuses appointing the creator to their own event', async () => {
    const { service } = build()
    await expect(service.add(CREATOR, EVENT, CREATOR)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    })
  })

  it('is idempotent: appointing twice is one appointment', async () => {
    const { service, repo } = build()
    await service.add(CREATOR, EVENT, FRIEND)
    await service.add(CREATOR, EVENT, FRIEND)
    expect(repo.rows).toHaveLength(1)
  })

  it('only the creator removes, and removing works at any time', async () => {
    const { service, repo } = build()
    await service.add(CREATOR, EVENT, FRIEND)
    await expect(service.remove(FRIEND, EVENT, FRIEND)).rejects.toMatchObject({ status: 403 })
    await service.remove(CREATOR, EVENT, FRIEND)
    expect(repo.rows).toHaveLength(0)
    expect(await service.isOrganizer(EVENT, FRIEND)).toBe(false)
  })

  it('404s on an event that does not exist', async () => {
    const { service } = build()
    await expect(service.add(CREATOR, 'nope', FRIEND)).rejects.toMatchObject({ status: 404 })
  })
})

describe('FriendsService', () => {
  it('merges partners and accepted team-ups, partner winning when both apply', async () => {
    const partnerships = {
      findPartners: vi.fn(async () => [
        { id: 'p1', player1_id: 'me', player2_id: 'a', created_at: '' }
      ])
    } as unknown as PartnershipRepository
    const teamUps = {
      findAcceptedPeerIds: vi.fn(async () => ['a', 'b', 'me'])
    } as unknown as TeamUpRepository
    const list = await createFriendsService(partnerships, teamUps).listFriends('me')
    expect(list).toEqual([
      { player_id: 'a', via: 'partner' },
      { player_id: 'b', via: 'team_up' }
    ])
  })
})
