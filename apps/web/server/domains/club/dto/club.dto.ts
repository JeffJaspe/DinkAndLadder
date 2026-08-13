export type ClubVisibility = 'public' | 'private'
export type ClubStatus = 'active' | 'archived'

export interface ClubRecord {
  id: string
  name: string
  slug: string
  description: string | null
  province: string | null
  city: string | null
  visibility: ClubVisibility
  status: ClubStatus
  created_by_user_id: string
  created_at: string
}

export interface ClubDto {
  id: string
  name: string
  slug: string
  description: string | null
  province: string | null
  city: string | null
  visibility: ClubVisibility
  status: ClubStatus
  created_at: string
}

export interface CreateClubInput {
  name: string
  slug: string
  description?: string | null
  province?: string | null
  city?: string | null
  visibility?: ClubVisibility
}

export function toClubDto(club: ClubRecord): ClubDto {
  return {
    id: club.id,
    name: club.name,
    slug: club.slug,
    description: club.description,
    province: club.province,
    city: club.city,
    visibility: club.visibility,
    status: club.status,
    created_at: club.created_at
  }
}
