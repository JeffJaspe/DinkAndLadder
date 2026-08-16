export type ActivityType =
  | 'match.verified'
  | 'rating.changed'
  | 'achievement.earned'
  | 'profile.updated'
  | 'club.event_created'
  | 'club.member_joined'
  | 'club.announcement'
  | 'social.started_following'

export type ActivityVisibility = 'public' | 'followers' | 'club' | 'private'

export interface ActivityRecord {
  id: string
  actor_player_id: string | null
  actor_club_id: string | null
  activity_type: ActivityType
  reference_type: string | null
  reference_id: string | null
  visibility: ActivityVisibility
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface ActivityDto {
  id: string
  actor_player_id: string | null
  actor_club_id: string | null
  activity_type: ActivityType
  reference_type: string | null
  reference_id: string | null
  visibility: ActivityVisibility
  metadata: Record<string, unknown> | null
  created_at: string
}

export function toActivityDto(record: ActivityRecord): ActivityDto {
  return {
    id: record.id,
    actor_player_id: record.actor_player_id,
    actor_club_id: record.actor_club_id,
    activity_type: record.activity_type,
    reference_type: record.reference_type,
    reference_id: record.reference_id,
    visibility: record.visibility,
    metadata: record.metadata,
    created_at: record.created_at
  }
}

export interface CreateActivityInput {
  actor_player_id?: string | null
  actor_club_id?: string | null
  activity_type: ActivityType
  reference_type?: string | null
  reference_id?: string | null
  visibility?: ActivityVisibility
  metadata?: Record<string, unknown> | null
}

export interface FeedQuery {
  limit: number
  offset: number
  types?: ActivityType[]
  since?: string
}
