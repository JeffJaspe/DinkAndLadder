export interface ShoutoutRecord {
  id: string
  player_id: string
  message: string
  is_active: boolean
  created_at: string
  updated_at: string
  expires_at: string | null
  /** Optional event this shout-out is about. See 038-shoutout-event-link. */
  event_id: string | null
}

export interface ShoutoutDto {
  id: string
  player_id: string
  message: string
  created_at: string
  updated_at: string
  expires_at: string | null
  event_id: string | null
  player?: {
    id: string
    display_name: string
  }
  /** Filled in by the read path when the shout-out points at an event. */
  event?: {
    id: string
    title: string
    start_date: string | null
  } | null
}

export interface CreateShoutoutInput {
  message: string
  /**
   * An event the player created or is registered for. Validated server-side
   * against exactly that list - a shout-out must not be able to advertise an
   * arbitrary event id the poster has nothing to do with.
   */
  event_id?: string | null
}

export interface UpdateShoutoutInput {
  message: string
  event_id?: string | null
}

export function toShoutoutDto(record: ShoutoutRecord): ShoutoutDto {
  return {
    id: record.id,
    player_id: record.player_id,
    message: record.message,
    created_at: record.created_at,
    updated_at: record.updated_at,
    expires_at: record.expires_at,
    event_id: record.event_id ?? null
  }
}
