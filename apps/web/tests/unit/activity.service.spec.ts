import { describe, it, expect, vi } from 'vitest'
import { createActivityService, createActivityLogger } from '../../server/domains/activity/services/activity.service'
import type { ActivityRepository } from '../../server/domains/activity/repositories/activity.repository'
import type { RelationshipRepository } from '../../server/domains/social/repositories/relationship.repository'
import type { ActivityRecord } from '../../server/domains/activity/dto/activity.dto'

function createFakeActivityRepository(overrides?: Partial<ActivityRepository>): ActivityRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByActorPlayer: vi.fn().mockResolvedValue([]),
    findPublicFeed: vi.fn().mockResolvedValue([]),
    findFollowingFeed: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    ...overrides
  }
}

function createFakeRelationshipRepository(overrides?: Partial<RelationshipRepository>): RelationshipRepository {
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
    countFollowing: vi.fn().mockResolvedValue(0),
    ...overrides
  }
}

function makeActivityRecord(overrides?: Partial<ActivityRecord>): ActivityRecord {
  return {
    id: 'activity-1',
    actor_player_id: 'player-1',
    actor_club_id: null,
    activity_type: 'match.verified',
    reference_type: 'match',
    reference_id: 'match-1',
    visibility: 'public',
    metadata: null,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides
  }
}

describe('ActivityService', () => {
  describe('createActivity', () => {
    it('creates an activity and returns DTO', async () => {
      const record = makeActivityRecord()
      const activityRepo = createFakeActivityRepository({
        create: vi.fn().mockResolvedValue(record)
      })
      const service = createActivityService(activityRepo, createFakeRelationshipRepository())

      const result = await service.createActivity({
        actor_player_id: 'player-1',
        activity_type: 'match.verified',
        reference_type: 'match',
        reference_id: 'match-1'
      })

      expect(result.id).toBe('activity-1')
      expect(result.activity_type).toBe('match.verified')
    })
  })

  describe('getPublicFeed', () => {
    it('returns public activities', async () => {
      const records = [
        makeActivityRecord({ id: 'activity-1' }),
        makeActivityRecord({ id: 'activity-2' })
      ]
      const activityRepo = createFakeActivityRepository({
        findPublicFeed: vi.fn().mockResolvedValue(records)
      })
      const service = createActivityService(activityRepo, createFakeRelationshipRepository())

      const result = await service.getPublicFeed({ limit: 20, offset: 0 })

      expect(result).toHaveLength(2)
    })
  })

  describe('getPersonalizedFeed', () => {
    it('includes activities from followed players', async () => {
      const followingRecords = [
        { id: 'rel-1', from_player_id: 'player-1', to_player_id: 'player-2', relationship_type: 'follow' as const, status: 'active' as const, created_at: '', updated_at: '' }
      ]
      const activities = [makeActivityRecord({ actor_player_id: 'player-2' })]

      const activityRepo = createFakeActivityRepository({
        findFollowingFeed: vi.fn().mockResolvedValue(activities)
      })
      const relationshipRepo = createFakeRelationshipRepository({
        findFollowing: vi.fn().mockResolvedValue(followingRecords)
      })
      const service = createActivityService(activityRepo, relationshipRepo)

      const result = await service.getPersonalizedFeed('player-1', [], { limit: 20, offset: 0 })

      expect(result).toHaveLength(1)
      expect(result[0].actor_player_id).toBe('player-2')
    })
  })

  describe('getPlayerActivities', () => {
    it('returns player public activities', async () => {
      const records = [makeActivityRecord()]
      const activityRepo = createFakeActivityRepository({
        findByActorPlayer: vi.fn().mockResolvedValue(records)
      })
      const service = createActivityService(activityRepo, createFakeRelationshipRepository())

      const result = await service.getPlayerActivities('player-1', 20, 0)

      expect(result).toHaveLength(1)
    })
  })
})

describe('ActivityLogger', () => {
  describe('logMatchVerified', () => {
    it('creates a match.verified activity', async () => {
      const createFn = vi.fn().mockResolvedValue(makeActivityRecord())
      const activityRepo = createFakeActivityRepository({ create: createFn })
      const logger = createActivityLogger(activityRepo)

      await logger.logMatchVerified('player-1', 'match-1', { winner: 'player-1' })

      expect(createFn).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_player_id: 'player-1',
          activity_type: 'match.verified',
          reference_type: 'match',
          reference_id: 'match-1'
        })
      )
    })

    it('does not throw on error', async () => {
      const activityRepo = createFakeActivityRepository({
        create: vi.fn().mockRejectedValue(new Error('DB error'))
      })
      const logger = createActivityLogger(activityRepo)

      await expect(logger.logMatchVerified('player-1', 'match-1')).resolves.toBeUndefined()
    })
  })

  describe('logRatingChanged', () => {
    it('creates a rating.changed activity', async () => {
      const createFn = vi.fn().mockResolvedValue(makeActivityRecord())
      const activityRepo = createFakeActivityRepository({ create: createFn })
      const logger = createActivityLogger(activityRepo)

      await logger.logRatingChanged('player-1', 'singles', 3.5, 3.6)

      expect(createFn).toHaveBeenCalledWith(
        expect.objectContaining({
          activity_type: 'rating.changed',
          metadata: { rating_type: 'singles', old_rating: 3.5, new_rating: 3.6 }
        })
      )
    })
  })

  describe('logStartedFollowing', () => {
    it('creates a social.started_following activity', async () => {
      const createFn = vi.fn().mockResolvedValue(makeActivityRecord())
      const activityRepo = createFakeActivityRepository({ create: createFn })
      const logger = createActivityLogger(activityRepo)

      await logger.logStartedFollowing('player-1', 'player-2')

      expect(createFn).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_player_id: 'player-1',
          activity_type: 'social.started_following',
          reference_id: 'player-2',
          visibility: 'followers'
        })
      )
    })
  })
})
