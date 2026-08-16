export type AnnouncementType = 'general' | 'event' | 'maintenance' | 'urgent'
export type AnnouncementVisibility = 'all_members' | 'active_members' | 'admins_only'
export type AnnouncementStatus = 'draft' | 'published' | 'archived'

export interface AnnouncementRecord {
  id: string
  club_id: string
  author_player_id: string
  title: string
  body: string
  announcement_type: AnnouncementType
  visibility: AnnouncementVisibility
  status: AnnouncementStatus
  event_id: string | null
  pinned: boolean
  published_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface AnnouncementDto {
  id: string
  club_id: string
  author_player_id: string
  title: string
  body: string
  announcement_type: AnnouncementType
  visibility: AnnouncementVisibility
  status: AnnouncementStatus
  event_id: string | null
  pinned: boolean
  published_at: string | null
  created_at: string
}

export function toAnnouncementDto(record: AnnouncementRecord): AnnouncementDto {
  return {
    id: record.id,
    club_id: record.club_id,
    author_player_id: record.author_player_id,
    title: record.title,
    body: record.body,
    announcement_type: record.announcement_type,
    visibility: record.visibility,
    status: record.status,
    event_id: record.event_id,
    pinned: record.pinned,
    published_at: record.published_at,
    created_at: record.created_at
  }
}

export interface CreateAnnouncementInput {
  club_id: string
  title: string
  body: string
  announcement_type?: AnnouncementType
  visibility?: AnnouncementVisibility
  event_id?: string | null
}

export interface UpdateAnnouncementInput {
  title?: string
  body?: string
  announcement_type?: AnnouncementType
  visibility?: AnnouncementVisibility
  event_id?: string | null
}

export interface AnnouncementReadRecord {
  id: string
  announcement_id: string
  player_id: string
  read_at: string
}
