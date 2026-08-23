import { describe, it, expect, vi } from 'vitest'
import {
  createActivityService,
  createActivityLogger
} from '../../server/domains/activity/services/activity.service'
import type { ActivityRepository } from '../../server/domains/activity/repositories/activity.repository'
import type { RelationshipRepository } from '../../server/domains/social/repositories/relationship.repository'
import type { ActivityRecord } from '../../server/domains/activity/dto/activity.dto'
import type { ClubRepository } from '../../server/domains/club/repositories/club.repository'
import type { ClubRecord } from '../../server/domains/club/dto/club.dto'

function makeClubRecord(overrides?: Partial<ClubRecord>): ClubRecord {
  return {
    id: 'club-1',
    name: 'Test Club',
    slug: 'test-club',
    description: null,
    province: null,
    city: null,
    barangay: null,
    court_name: null,
    court_address: null,
    visibility: 'public',
    status: 'active',
    created_by_user_id: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    verification_status: 'unverified',
    verification_requested_at: null,
    verified_at: null,
    verified_by_user_id: null,
    ...overrides
  }
}

function createFakeClubRepository(byId: Record<string, ClubRecord>): ClubRepository {
  return {
    findById: vi.fn(async (id: string) => byId[id] ?? null),
    findBySlug: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    updateVerification: vi.fn(),
    findPendingVerification: vi.fn().mockResolvedValue([]),
    findVerifiedClubs: vi.fn().mockResolvedValue([])
  }
}

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

function createFakeRelationshipRepository(
  overrides?: Partial<RelationshipRepository>
): RelationshipRepository {
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
        {
          id: 'rel-1',
          from_player_id: 'player-1',
          to_player_id: 'player-2',
          relationship_type: 'follow' as const,
          status: 'active' as const,
          created_at: '',
          updated_at: ''
        }
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

    it("prioritizes the player's own verified club above other verified clubs, above unverified/personal activity", async () => {
      const activities = [
        makeActivityRecord({
          id: 'a-personal',
          actor_club_id: null,
          created_at: '2026-08-03T00:00:00Z'
        }),
        makeActivityRecord({
          id: 'a-other-verified',
          actor_club_id: 'club-other',
          created_at: '2026-08-01T00:00:00Z'
        }),
        makeActivityRecord({
          id: 'a-own-verified',
          actor_club_id: 'club-mine',
          created_at: '2026-08-02T00:00:00Z'
        }),
        makeActivityRecord({
          id: 'a-unverified',
          actor_club_id: 'club-unverified',
          created_at: '2026-08-04T00:00:00Z'
        })
      ]
      const activityRepo = createFakeActivityRepository({
        findFollowingFeed: vi.fn().mockResolvedValue(activities)
      })
      const clubRepo = createFakeClubRepository({
        'club-mine': makeClubRecord({ id: 'club-mine', verification_status: 'verified' }),
        'club-other': makeClubRecord({ id: 'club-other', verification_status: 'verified' }),
        'club-unverified': makeClubRecord({
          id: 'club-unverified',
          verification_status: 'unverified'
        })
      })

      const service = createActivityService(
        activityRepo,
        createFakeRelationshipRepository(),
        clubRepo
      )

      const result = await service.getPersonalizedFeed('player-1', ['club-mine'], {
        limit: 20,
        offset: 0
      })

      expect(result.map((r) => r.id)).toEqual([
        'a-own-verified',
        'a-other-verified',
        'a-unverified',
        'a-personal'
      ])
    })

    it('leaves ordering unchanged when no ClubRepository is provided (backward compatible)', async () => {
      const activities = [
        makeActivityRecord({ id: 'a-1', created_at: '2026-08-01T00:00:00Z' }),
        makeActivityRecord({ id: 'a-2', created_at: '2026-08-02T00:00:00Z' })
      ]
      const activityRepo = createFakeActivityRepository({
        findFollowingFeed: vi.fn().mockResolvedValue(activities)
      })
      const service = createActivityService(activityRepo, createFakeRelationshipRepository())

      const result = await service.getPersonalizedFeed('player-1', [], { limit: 20, offset: 0 })

      expect(result.map((r) => r.id)).toEqual(['a-1', 'a-2'])
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
