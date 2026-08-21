export interface ShoutoutRecord {
  id: string
  player_id: string
  message: string
  is_active: boolean
  created_at: string
  updated_at: string
  expires_at: string | null
}

export interface ShoutoutDto {
  id: string
  player_id: string
  message: string
  created_at: string
  updated_at: string
  expires_at: string | null
  player?: {
    id: string
    display_name: string
  }
}

export interface CreateShoutoutInput {
  message: string
}

export interface UpdateShoutoutInput {
  message: string
}

export function toShoutoutDto(record: ShoutoutRecord): ShoutoutDto {
  return {
    id: record.id,
    player_id: record.player_id,
    message: record.message,
    created_at: record.created_at,
    updated_at: record.updated_at,
    expires_at: record.expires_at
  }
}
