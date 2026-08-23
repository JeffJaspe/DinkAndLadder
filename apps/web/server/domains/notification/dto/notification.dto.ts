export type NotificationType =
  | 'club.membership_approved'
  | 'club.membership_rejected'
  | 'club.membership_request'
  | 'club.role_changed'
  | 'match.verification_requested'
  | 'match.verified'
  | 'match.rejected'
  | 'match.disputed'
  | 'rating.updated'
  | 'partner.request_received'
  | 'partner.request_accepted'
  | 'partner.request_declined'
  | 'club.announcement'

export type NotificationReferenceType =
  | 'club_membership'
  | 'match'
  | 'match_verification'
  | 'player_rating'
  | 'partner_request'
  | 'partnership'
  | 'club_announcement'

export interface NotificationRecord {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  reference_type: string | null
  reference_id: string | null
  read_at: string | null
  created_at: string
}

export interface NotificationDto {
  id: string
  type: string
  title: string
  body: string
  reference_type: string | null
  reference_id: string | null
  read: boolean
  created_at: string
}

export function toNotificationDto(record: NotificationRecord): NotificationDto {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    body: record.body,
    reference_type: record.reference_type,
    reference_id: record.reference_id,
    read: record.read_at !== null,
    created_at: record.created_at
  }
}

export interface CreateNotificationInput {
  user_id: string
  type: NotificationType
  title: string
  body: string
  reference_type?: NotificationReferenceType
  reference_id?: string
}

export interface NotificationQuery {
  limit: number
  offset: number
  unread_only?: boolean
}
