import type { RelationshipRepository } from '../repositories/relationship.repository'
import type { FollowerDto, FollowingDto, RelationshipDto } from '../dto/relationship.dto'
import { toRelationshipDto } from '../dto/relationship.dto'

export class RelationshipServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface RelationshipService {
  follow(fromPlayerId: string, toPlayerId: string): Promise<RelationshipDto>
  unfollow(fromPlayerId: string, toPlayerId: string): Promise<void>
  block(fromPlayerId: string, toPlayerId: string): Promise<RelationshipDto>
  unblock(fromPlayerId: string, toPlayerId: string): Promise<void>
  getFollowing(playerId: string, limit: number, offset: number): Promise<FollowingDto[]>
  getFollowers(playerId: string, limit: number, offset: number): Promise<FollowerDto[]>
  getBlocked(playerId: string): Promise<RelationshipDto[]>
  isFollowing(fromPlayerId: string, toPlayerId: string): Promise<boolean>
  isBlocked(fromPlayerId: string, toPlayerId: string): Promise<boolean>
  getStats(playerId: string): Promise<{ followers: number; following: number }>
}

export function createRelationshipService(relationships: RelationshipRepository): RelationshipService {
  return {
    async follow(fromPlayerId, toPlayerId) {
      if (fromPlayerId === toPlayerId) {
        throw new RelationshipServiceError(400, 'CANNOT_FOLLOW_SELF', 'You cannot follow yourself.')
      }

      const isBlocked = await relationships.isBlocked(toPlayerId, fromPlayerId)
      if (isBlocked) {
        throw new RelationshipServiceError(403, 'BLOCKED', 'You cannot follow this player.')
      }

      const existing = await relationships.findByFromAndTo(fromPlayerId, toPlayerId, 'follow')
      if (existing) {
        throw new RelationshipServiceError(409, 'ALREADY_FOLLOWING', 'You are already following this player.')
      }

      const record = await relationships.create(fromPlayerId, toPlayerId, 'follow', 'active')
      return toRelationshipDto(record)
    },

    async unfollow(fromPlayerId, toPlayerId) {
      const existing = await relationships.findByFromAndTo(fromPlayerId, toPlayerId, 'follow')
      if (!existing) {
        throw new RelationshipServiceError(404, 'NOT_FOLLOWING', 'You are not following this player.')
      }

      await relationships.delete(existing.id)
    },

    async block(fromPlayerId, toPlayerId) {
      if (fromPlayerId === toPlayerId) {
        throw new RelationshipServiceError(400, 'CANNOT_BLOCK_SELF', 'You cannot block yourself.')
      }

      const existingBlock = await relationships.findByFromAndTo(fromPlayerId, toPlayerId, 'block')
      if (existingBlock) {
        throw new RelationshipServiceError(409, 'ALREADY_BLOCKED', 'You have already blocked this player.')
      }

      const existingFollow = await relationships.findByFromAndTo(fromPlayerId, toPlayerId, 'follow')
      if (existingFollow) {
        await relationships.delete(existingFollow.id)
      }

      const theirFollow = await relationships.findByFromAndTo(toPlayerId, fromPlayerId, 'follow')
      if (theirFollow) {
        await relationships.delete(theirFollow.id)
      }

      const record = await relationships.create(fromPlayerId, toPlayerId, 'block', 'active')
      return toRelationshipDto(record)
    },

    async unblock(fromPlayerId, toPlayerId) {
      const existing = await relationships.findByFromAndTo(fromPlayerId, toPlayerId, 'block')
      if (!existing) {
        throw new RelationshipServiceError(404, 'NOT_BLOCKED', 'You have not blocked this player.')
      }

      await relationships.delete(existing.id)
    },

    async getFollowing(playerId, limit, offset) {
      const records = await relationships.findFollowing(playerId, limit, offset)
      return records.map((r) => ({
        player_id: r.to_player_id,
        following_since: r.created_at
      }))
    },

    async getFollowers(playerId, limit, offset) {
      const records = await relationships.findFollowers(playerId, limit, offset)
      return records.map((r) => ({
        player_id: r.from_player_id,
        followed_at: r.created_at
      }))
    },

    async getBlocked(playerId) {
      const records = await relationships.findBlocked(playerId)
      return records.map(toRelationshipDto)
    },

    async isFollowing(fromPlayerId, toPlayerId) {
      const existing = await relationships.findByFromAndTo(fromPlayerId, toPlayerId, 'follow')
      return existing !== null && existing.status === 'active'
    },

    async isBlocked(fromPlayerId, toPlayerId) {
      return relationships.isBlocked(fromPlayerId, toPlayerId)
    },

    async getStats(playerId) {
      const [followers, following] = await Promise.all([
        relationships.countFollowers(playerId),
        relationships.countFollowing(playerId)
      ])
      return { followers, following }
    }
  }
}
