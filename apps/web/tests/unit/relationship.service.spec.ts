import { describe, it, expect, vi } from 'vitest'
import {
  createRelationshipService,
  RelationshipServiceError
} from '../../server/domains/social/services/relationship.service'
import type { RelationshipRepository } from '../../server/domains/social/repositories/relationship.repository'
import type { RelationshipRecord } from '../../server/domains/social/dto/relationship.dto'

function createFakeRepository(overrides?: Partial<RelationshipRepository>): RelationshipRepository {
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

function makeRelationshipRecord(overrides?: Partial<RelationshipRecord>): RelationshipRecord {
  return {
    id: 'rel-1',
    from_player_id: 'player-1',
    to_player_id: 'player-2',
    relationship_type: 'follow',
    status: 'active',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides
  }
}

describe('RelationshipService', () => {
  describe('follow', () => {
    it('creates a follow relationship', async () => {
      const record = makeRelationshipRecord()
      const repo = createFakeRepository({
        create: vi.fn().mockResolvedValue(record)
      })
      const service = createRelationshipService(repo)

      const result = await service.follow('player-1', 'player-2')

      expect(result.from_player_id).toBe('player-1')
      expect(result.to_player_id).toBe('player-2')
      expect(result.relationship_type).toBe('follow')
    })

    it('throws when trying to follow self', async () => {
      const service = createRelationshipService(createFakeRepository())

      await expect(service.follow('player-1', 'player-1')).rejects.toThrow(RelationshipServiceError)
    })

    it('throws when already following', async () => {
      const existing = makeRelationshipRecord()
      const repo = createFakeRepository({
        findByFromAndTo: vi.fn().mockResolvedValue(existing)
      })
      const service = createRelationshipService(repo)

      await expect(service.follow('player-1', 'player-2')).rejects.toThrow(RelationshipServiceError)
    })

    it('throws when blocked by target', async () => {
      const repo = createFakeRepository({
        isBlocked: vi.fn().mockResolvedValue(true)
      })
      const service = createRelationshipService(repo)

      await expect(service.follow('player-1', 'player-2')).rejects.toThrow(RelationshipServiceError)
    })
  })

  describe('unfollow', () => {
    it('removes a follow relationship', async () => {
      const existing = makeRelationshipRecord()
      const repo = createFakeRepository({
        findByFromAndTo: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(undefined)
      })
      const service = createRelationshipService(repo)

      await service.unfollow('player-1', 'player-2')

      expect(repo.delete).toHaveBeenCalledWith('rel-1')
    })

    it('throws when not following', async () => {
      const service = createRelationshipService(createFakeRepository())

      await expect(service.unfollow('player-1', 'player-2')).rejects.toThrow(
        RelationshipServiceError
      )
    })
  })

  describe('block', () => {
    it('creates a block relationship and removes mutual follows', async () => {
      const followRecord = makeRelationshipRecord({ id: 'follow-1' })
      const theirFollowRecord = makeRelationshipRecord({
        id: 'follow-2',
        from_player_id: 'player-2',
        to_player_id: 'player-1'
      })
      const blockRecord = makeRelationshipRecord({ id: 'block-1', relationship_type: 'block' })

      let findCall = 0
      const repo = createFakeRepository({
        findByFromAndTo: vi.fn().mockImplementation(async (from, to, type) => {
          if (type === 'block') return null
          findCall++
          if (findCall === 1) return followRecord
          return theirFollowRecord
        }),
        create: vi.fn().mockResolvedValue(blockRecord),
        delete: vi.fn().mockResolvedValue(undefined)
      })
      const service = createRelationshipService(repo)

      const result = await service.block('player-1', 'player-2')

      expect(result.relationship_type).toBe('block')
      expect(repo.delete).toHaveBeenCalledTimes(2)
    })

    it('throws when trying to block self', async () => {
      const service = createRelationshipService(createFakeRepository())

      await expect(service.block('player-1', 'player-1')).rejects.toThrow(RelationshipServiceError)
    })

    it('throws when already blocked', async () => {
      const existing = makeRelationshipRecord({ relationship_type: 'block' })
      const repo = createFakeRepository({
        findByFromAndTo: vi.fn().mockResolvedValue(existing)
      })
      const service = createRelationshipService(repo)

      await expect(service.block('player-1', 'player-2')).rejects.toThrow(RelationshipServiceError)
    })
  })

  describe('unblock', () => {
    it('removes a block relationship', async () => {
      const existing = makeRelationshipRecord({ relationship_type: 'block' })
      const repo = createFakeRepository({
        findByFromAndTo: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(undefined)
      })
      const service = createRelationshipService(repo)

      await service.unblock('player-1', 'player-2')

      expect(repo.delete).toHaveBeenCalledWith('rel-1')
    })

    it('throws when not blocked', async () => {
      const service = createRelationshipService(createFakeRepository())

      await expect(service.unblock('player-1', 'player-2')).rejects.toThrow(
        RelationshipServiceError
      )
    })
  })

  describe('getStats', () => {
    it('returns follower and following counts', async () => {
      const repo = createFakeRepository({
        countFollowers: vi.fn().mockResolvedValue(10),
        countFollowing: vi.fn().mockResolvedValue(5)
      })
      const service = createRelationshipService(repo)

      const stats = await service.getStats('player-1')

      expect(stats.followers).toBe(10)
      expect(stats.following).toBe(5)
    })
  })

  describe('getFollowing', () => {
    it('returns following list mapped to DTOs', async () => {
      const records = [
        makeRelationshipRecord({ to_player_id: 'player-2' }),
        makeRelationshipRecord({ to_player_id: 'player-3' })
      ]
      const repo = createFakeRepository({
        findFollowing: vi.fn().mockResolvedValue(records)
      })
      const service = createRelationshipService(repo)

      const following = await service.getFollowing('player-1', 20, 0)

      expect(following).toHaveLength(2)
      expect(following[0].player_id).toBe('player-2')
      expect(following[1].player_id).toBe('player-3')
    })
  })

  describe('getFollowers', () => {
    it('returns followers list mapped to DTOs', async () => {
      const records = [
        makeRelationshipRecord({ from_player_id: 'player-2', to_player_id: 'player-1' }),
        makeRelationshipRecord({ from_player_id: 'player-3', to_player_id: 'player-1' })
      ]
      const repo = createFakeRepository({
        findFollowers: vi.fn().mockResolvedValue(records)
      })
      const service = createRelationshipService(repo)

      const followers = await service.getFollowers('player-1', 20, 0)

      expect(followers).toHaveLength(2)
      expect(followers[0].player_id).toBe('player-2')
      expect(followers[1].player_id).toBe('player-3')
    })
  })
})
