export type ProfileVisibility = 'public' | 'private'

export interface PlayerProfileRecord {
  id: string
  user_id: string
  display_name: string
  first_name: string | null
  last_name: string | null
  bio: string | null
  province: string | null
  city: string | null
  dominant_hand: string | null
  preferred_position: string | null
  profile_visibility: ProfileVisibility
  created_at: string
  updated_at: string
}

export interface PlayerProfileDto {
  id: string
  display_name: string
  first_name: string | null
  last_name: string | null
  bio: string | null
  province: string | null
  city: string | null
  dominant_hand: string | null
  preferred_position: string | null
  profile_visibility: ProfileVisibility
  created_at: string
}

export interface UpdatePlayerProfileInput {
  display_name: string
  first_name?: string | null
  last_name?: string | null
  bio?: string | null
  province?: string | null
  city?: string | null
  dominant_hand?: string | null
  preferred_position?: string | null
  profile_visibility?: ProfileVisibility
}

export function toPlayerProfileDto(profile: PlayerProfileRecord): PlayerProfileDto {
  return {
    id: profile.id,
    display_name: profile.display_name,
    first_name: profile.first_name,
    last_name: profile.last_name,
    bio: profile.bio,
    province: profile.province,
    city: profile.city,
    dominant_hand: profile.dominant_hand,
    preferred_position: profile.preferred_position,
    profile_visibility: profile.profile_visibility,
    created_at: profile.created_at
  }
}
