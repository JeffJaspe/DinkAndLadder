export type RelationshipType = 'follow' | 'block'
export type RelationshipStatus = 'pending' | 'active'

export interface RelationshipRecord {
  id: string
  from_player_id: string
  to_player_id: string
  relationship_type: RelationshipType
  status: RelationshipStatus
  created_at: string
  updated_at: string
}

export interface RelationshipDto {
  id: string
  from_player_id: string
  to_player_id: string
  relationship_type: RelationshipType
  status: RelationshipStatus
  created_at: string
}

export function toRelationshipDto(record: RelationshipRecord): RelationshipDto {
  return {
    id: record.id,
    from_player_id: record.from_player_id,
    to_player_id: record.to_player_id,
    relationship_type: record.relationship_type,
    status: record.status,
    created_at: record.created_at
  }
}

export interface FollowerDto {
  player_id: string
  followed_at: string
}

export interface FollowingDto {
  player_id: string
  following_since: string
}
