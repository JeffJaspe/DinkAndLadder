export type AuditEventType =
  | 'club.role_change'
  | 'club.membership_approve'
  | 'club.membership_reject'
  | 'club.membership_remove'
  | 'match.verification_decision'
  | 'player.profile_admin_change'
  | 'rating.correction'

export type AuditTargetType =
  | 'club_membership'
  | 'match'
  | 'match_verification'
  | 'player_profile'
  | 'player_rating'

export interface AuditLogInput {
  event_type: AuditEventType
  actor_user_id: string | null
  actor_player_id: string | null
  target_type: AuditTargetType
  target_id: string
  payload?: Record<string, unknown>
  ip_address?: string | null
  user_agent?: string | null
}

export interface AuditLogRecord {
  id: string
  event_type: string
  actor_user_id: string | null
  actor_player_id: string | null
  target_type: string
  target_id: string
  payload: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}
