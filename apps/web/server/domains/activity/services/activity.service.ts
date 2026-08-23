import type { ActivityRepository } from '../repositories/activity.repository'
import type { RelationshipRepository } from '../../social/repositories/relationship.repository'
import type { ClubRepository } from '../../club/repositories/club.repository'
import type { ActivityDto, ActivityRecord, CreateActivityInput, FeedQuery } from '../dto/activity.dto'
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
  getPersonalizedFeed(playerId: string, clubIds: string[], query: FeedQuery, circlePlayerIds?: string[]): Promise<ActivityDto[]>
}

export function createActivityService(
  activities: ActivityRepository,
  relationships: RelationshipRepository,
  clubs?: ClubRepository
): ActivityService {
  /**
   * Feed prioritization (plan: "verified clubs first, then the player's own verified
   * memberships, then everything else") re-sorts the already-fetched page rather than
   * reordering before pagination — PostgREST can't cleanly order by a joined table's
   * column, and re-fetching every matching row just to sort would change pagination
   * semantics considerably for a first pass. Known simplification: prioritization only
   * takes effect within a page, not across the full result set.
   */
  async function reprioritize(
    records: ActivityRecord[],
    memberClubIds: string[]
  ): Promise<ActivityRecord[]> {
    if (!clubs) return records
    const clubIds = [...new Set(records.map((r) => r.actor_club_id).filter((id): id is string => !!id))]
    if (clubIds.length === 0) return records

    const memberSet = new Set(memberClubIds)
    const verifiedSet = new Set<string>()
    await Promise.all(
      clubIds.map(async (id) => {
        const club = await clubs.findById(id)
        if (club?.verification_status === 'verified') verifiedSet.add(id)
      })
    )

    function priority(record: ActivityRecord): number {
      if (!record.actor_club_id) return 0
      const verified = verifiedSet.has(record.actor_club_id)
      const own = memberSet.has(record.actor_club_id)
      if (verified && own) return 2
      if (verified) return 1
      return 0
    }

    return [...records].sort((a, b) => {
      const diff = priority(b) - priority(a)
      if (diff !== 0) return diff
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }

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
      const prioritized = await reprioritize(records, [])
      return prioritized.map(toActivityDto)
    },

    async getPersonalizedFeed(playerId, clubIds, query, circlePlayerIds = []) {
      const followingRecords = await relationships.findFollowing(playerId, 1000, 0)
      const followingPlayerIds = followingRecords.map((r) => r.to_player_id)

      followingPlayerIds.push(playerId)

      const allPlayerIds = [...new Set([...followingPlayerIds, ...circlePlayerIds])]

      const records = await activities.findFollowingFeed(
        allPlayerIds,
        clubIds,
        query.limit,
        query.offset,
        query.types,
        query.since
      )
      const prioritized = await reprioritize(records, clubIds)
      return prioritized.map(toActivityDto)
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
    },

    async logShoutout(
      actorPlayerId: string,
      message: string
    ): Promise<void> {
      try {
        await activities.create({
          actor_player_id: actorPlayerId,
          activity_type: 'social.shoutout',
          visibility: 'public',
          metadata: { message }
        })
      } catch {
        // Best-effort logging
      }
    }
  }
}

export type ActivityLogger = ReturnType<typeof createActivityLogger>
