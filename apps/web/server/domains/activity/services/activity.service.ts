import type { ActivityRepository } from '../repositories/activity.repository'
import type { RelationshipRepository } from '../../social/repositories/relationship.repository'
import type { ActivityDto, ActivityType, CreateActivityInput, FeedQuery } from '../dto/activity.dto'
import { toActivityDto } from '../dto/activity.dto'

export class ActivityServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface ActivityService {
  createActivity(input: CreateActivityInput): Promise<ActivityDto>
  getPlayerActivities(playerId: string, limit: number, offset: number): Promise<ActivityDto[]>
  getPublicFeed(query: FeedQuery): Promise<ActivityDto[]>
  getPersonalizedFeed(playerId: string, clubIds: string[], query: FeedQuery): Promise<ActivityDto[]>
}

export function createActivityService(
  activities: ActivityRepository,
  relationships: RelationshipRepository
): ActivityService {
  return {
    async createActivity(input) {
      const record = await activities.create(input)
      return toActivityDto(record)
    },

    async getPlayerActivities(playerId, limit, offset) {
      const records = await activities.findByActorPlayer(playerId, limit, offset)
      return records.map(toActivityDto)
    },

    async getPublicFeed(query) {
      const records = await activities.findPublicFeed(
        query.limit,
        query.offset,
        query.types,
        query.since
      )
      return records.map(toActivityDto)
    },

    async getPersonalizedFeed(playerId, clubIds, query) {
      const followingRecords = await relationships.findFollowing(playerId, 1000, 0)
      const followingPlayerIds = followingRecords.map((r) => r.to_player_id)

      followingPlayerIds.push(playerId)

      const records = await activities.findFollowingFeed(
        followingPlayerIds,
        clubIds,
        query.limit,
        query.offset,
        query.types,
        query.since
      )
      return records.map(toActivityDto)
    }
  }
}

export function createActivityLogger(activities: ActivityRepository) {
  return {
    async logMatchVerified(
      actorPlayerId: string,
      matchId: string,
      metadata?: Record<string, unknown>
    ): Promise<void> {
      try {
        await activities.create({
          actor_player_id: actorPlayerId,
          activity_type: 'match.verified',
          reference_type: 'match',
          reference_id: matchId,
          visibility: 'public',
          metadata
        })
      } catch {
        // Best-effort logging
      }
    },

    async logRatingChanged(
      actorPlayerId: string,
      ratingType: string,
      oldRating: number,
      newRating: number
    ): Promise<void> {
      try {
        await activities.create({
          actor_player_id: actorPlayerId,
          activity_type: 'rating.changed',
          reference_type: 'rating',
          visibility: 'public',
          metadata: { rating_type: ratingType, old_rating: oldRating, new_rating: newRating }
        })
      } catch {
        // Best-effort logging
      }
    },

    async logStartedFollowing(
      actorPlayerId: string,
      followedPlayerId: string
    ): Promise<void> {
      try {
        await activities.create({
          actor_player_id: actorPlayerId,
          activity_type: 'social.started_following',
          reference_type: 'player',
          reference_id: followedPlayerId,
          visibility: 'followers'
        })
      } catch {
        // Best-effort logging
      }
    },

    async logClubEventCreated(
      actorPlayerId: string,
      clubId: string,
      eventId: string,
      eventName: string
    ): Promise<void> {
      try {
        await activities.create({
          actor_player_id: actorPlayerId,
          actor_club_id: clubId,
          activity_type: 'club.event_created',
          reference_type: 'event',
          reference_id: eventId,
          visibility: 'public',
          metadata: { event_name: eventName }
        })
      } catch {
        // Best-effort logging
      }
    },

    async logClubMemberJoined(
      actorPlayerId: string,
      clubId: string
    ): Promise<void> {
      try {
        await activities.create({
          actor_player_id: actorPlayerId,
          actor_club_id: clubId,
          activity_type: 'club.member_joined',
          reference_type: 'club',
          reference_id: clubId,
          visibility: 'club'
        })
      } catch {
        // Best-effort logging
      }
    }
  }
}
