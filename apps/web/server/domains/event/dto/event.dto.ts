export type EventStatus =
  | 'draft'
  | 'published'
  | 'registration_closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type EventVisibility = 'public' | 'private'

export interface EventRecord {
  id: string
  club_id: string
  name: string
  description: string | null
  venue: string | null
  province: string | null
  city: string | null
  start_date: string
  end_date: string
  registration_opens: string | null
  registration_closes: string | null
  status: EventStatus
  visibility: EventVisibility
  created_by_player_id: string
  created_at: string
  updated_at: string
}

export interface EventDto {
  id: string
  club_id: string
  name: string
  description: string | null
  venue: string | null
  province: string | null
  city: string | null
  start_date: string
  end_date: string
  registration_opens: string | null
  registration_closes: string | null
  status: EventStatus
  visibility: EventVisibility
  created_at: string
}

export function toEventDto(record: EventRecord): EventDto {
  return {
    id: record.id,
    club_id: record.club_id,
    name: record.name,
    description: record.description,
    venue: record.venue,
    province: record.province,
    city: record.city,
    start_date: record.start_date,
    end_date: record.end_date,
    registration_opens: record.registration_opens,
    registration_closes: record.registration_closes,
    status: record.status,
    visibility: record.visibility,
    created_at: record.created_at
  }
}

export interface CreateEventInput {
  club_id: string
  name: string
  description?: string | null
  venue?: string | null
  province?: string | null
  city?: string | null
  start_date: string
  end_date: string
  registration_opens?: string | null
  registration_closes?: string | null
  visibility?: EventVisibility
}

export interface UpdateEventInput {
  name?: string
  description?: string | null
  venue?: string | null
  province?: string | null
  city?: string | null
  start_date?: string
  end_date?: string
  registration_opens?: string | null
  registration_closes?: string | null
  visibility?: EventVisibility
}

export interface EventSearchQuery {
  club_id?: string
  province?: string
  city?: string
  status?: EventStatus
  visibility?: EventVisibility
  limit: number
  offset: number
}
