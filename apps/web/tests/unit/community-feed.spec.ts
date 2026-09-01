import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { attachLinkedEvents } from '../../server/domains/activity/services/linked-event'
import type { ActivityWithLinkedEvent } from '../../server/domains/activity/services/linked-event'
import { createActivityService } from '../../server/domains/activity/services/activity.service'
import type { ActivityRepository } from '../../server/domains/activity/repositories/activity.repository'
import type { RelationshipRepository } from '../../server/domains/social/repositories/relationship.repository'
import type { ActivityRecord } from '../../server/domains/activity/dto/activity.dto'

function makeActivityRecord(overrides?: Partial<ActivityRecord>): ActivityRecord {
  return {
    id: 'activity-1',
    actor_player_id: 'player-1',
    actor_club_id: null,
    activity_type: 'social.shoutout',
    reference_type: null,
    reference_id: null,
    visibility: 'public',
    metadata: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function createFakeActivityRepository(overrides?: Partial<ActivityRepository>): ActivityRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByActorPlayer: vi.fn().mockResolvedValue([]),
    findPublicFeed: vi.fn().mockResolvedValue([]),
    findFollowingFeed: vi.fn().mockResolvedValue([]),
    findGeoFeed: vi.fn().mockResolvedValue([]),
    countCommunity: vi.fn().mockResolvedValue(0),
    create: vi.fn(),
    ...overrides
  }
}

function createFakeRelationshipRepository(): RelationshipRepository {
  return {
    findByFromAndTo: vi.fn().mockResolvedValue(null),
    findFollowing: vi.fn().mockResolvedValue([]),
    findFollowers: vi.fn().mockResolvedValue([]),
    findBlocked: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    isBlocked: vi.fn().mockResolvedValue(false),
    countFollowers: vi.fn().mockResolvedValue(0),
    countFollowing: vi.fn().mockResolvedValue(0)
  }
}

/**
 * A Supabase client stub for `attachLinkedEvents`, which only ever does
 * `.from('events').select(...).in('id', ids)`.
 */
function fakeEventsClient(events: Array<Record<string, unknown>>) {
  const inSpy = vi.fn().mockResolvedValue({ data: events })
  return {
    client: {
      from: () => ({ select: () => ({ in: inSpy }) })
    } as unknown as SupabaseClient,
    inSpy
  }
}

describe('attachLinkedEvents', () => {
  const event = {
    id: 'event-1',
    name: 'Makati Club Ladder #1',
    start_date: '2026-09-09',
    city: 'Makati',
    venue: 'Poblacion Courts'
  }

  it('resolves the event a shout-out names in its metadata', async () => {
    const { client } = fakeEventsClient([event])

    const [enriched] = await attachLinkedEvents<ActivityWithLinkedEvent>(client, [
      { metadata: { event_id: 'event-1' } as Record<string, unknown> }
    ])

    expect(enriched!.event).toEqual(event)
  })

  it('resolves the event a club.event_created activity references', async () => {
    // The regression: the id lives in the reference columns for this activity
    // type, not in metadata, so "created an event: X" rendered as plain text
    // with nothing to click.
    const { client } = fakeEventsClient([event])

    const [enriched] = await attachLinkedEvents<ActivityWithLinkedEvent>(client, [
      {
        metadata: { event_name: 'Makati Club Ladder #1' },
        reference_type: 'event',
        reference_id: 'event-1'
      }
    ])

    expect(enriched!.event).toEqual(event)
  })

  it('ignores references to anything that is not an event', async () => {
    const { client, inSpy } = fakeEventsClient([])

    const [enriched] = await attachLinkedEvents<ActivityWithLinkedEvent>(client, [
      { reference_type: 'player', reference_id: 'player-9' }
    ])

    expect(enriched!.event).toBeUndefined()
    expect(inSpy).not.toHaveBeenCalled()
  })

  it('leaves the event null when it no longer exists', async () => {
    const { client } = fakeEventsClient([])

    const [enriched] = await attachLinkedEvents<ActivityWithLinkedEvent>(client, [
      { reference_type: 'event', reference_id: 'deleted-event' }
    ])

    expect(enriched!.event).toBeNull()
  })

  it('asks for every referenced event once, in one round trip', async () => {
    const { client, inSpy } = fakeEventsClient([event])

    await attachLinkedEvents<ActivityWithLinkedEvent>(client, [
      { reference_type: 'event', reference_id: 'event-1' },
      { reference_type: 'event', reference_id: 'event-1' },
      { metadata: { event_id: 'event-2' } as Record<string, unknown> }
    ])

    expect(inSpy).toHaveBeenCalledTimes(1)
    expect(inSpy).toHaveBeenCalledWith('id', ['event-1', 'event-2'])
  })
})

describe('ActivityService.getGeoFeed', () => {
  it('asks for the community scope by default', async () => {
    const activities = createFakeActivityRepository({
      findGeoFeed: vi.fn().mockResolvedValue([makeActivityRecord()])
    })
    const service = createActivityService(activities, createFakeRelationshipRepository())

    await service.getGeoFeed('player-1', { limit: 20, offset: 0 })

    expect(activities.findGeoFeed).toHaveBeenCalledWith(
      'player-1',
      20,
      0,
      undefined,
      undefined,
      'community'
    )
  })

  it('passes an explicit scope through', async () => {
    const activities = createFakeActivityRepository()
    const service = createActivityService(activities, createFakeRelationshipRepository())

    await service.getGeoFeed('player-1', { limit: 20, offset: 0, scope: 'geo' })

    expect(activities.findGeoFeed).toHaveBeenCalledWith(
      'player-1',
      20,
      0,
      undefined,
      undefined,
      'geo'
    )
  })

  it('counts the community when the first page comes back empty', async () => {
    // The two empty feeds the page has to tell apart: no community at all
    // (only yourself) versus a community that has simply been quiet.
    const activities = createFakeActivityRepository({
      countCommunity: vi.fn().mockResolvedValue(1)
    })
    const service = createActivityService(activities, createFakeRelationshipRepository())

    const result = await service.getGeoFeed('player-1', { limit: 20, offset: 0 })

    expect(result.activities).toEqual([])
    expect(result.community_size).toBe(1)
  })

  it('does not count the community on a page that has activity', async () => {
    const activities = createFakeActivityRepository({
      findGeoFeed: vi.fn().mockResolvedValue([makeActivityRecord()])
    })
    const service = createActivityService(activities, createFakeRelationshipRepository())

    const result = await service.getGeoFeed('player-1', { limit: 20, offset: 0 })

    expect(result.community_size).toBeNull()
    expect(activities.countCommunity).not.toHaveBeenCalled()
  })

  it('does not count the community when a later page runs out', async () => {
    const activities = createFakeActivityRepository()
    const service = createActivityService(activities, createFakeRelationshipRepository())

    const result = await service.getGeoFeed('player-1', { limit: 20, offset: 40 })

    expect(result.community_size).toBeNull()
    expect(activities.countCommunity).not.toHaveBeenCalled()
  })

  it('never counts a community for a signed-out viewer', async () => {
    const activities = createFakeActivityRepository()
    const service = createActivityService(activities, createFakeRelationshipRepository())

    const result = await service.getGeoFeed(null, { limit: 20, offset: 0 })

    expect(result.community_size).toBeNull()
    expect(activities.countCommunity).not.toHaveBeenCalled()
  })
})
