export type ClubVisibility = 'public' | 'private'
export type ClubStatus = 'active' | 'archived'
export type ClubVerificationStatus = 'unverified' | 'pending' | 'verified' | 'suspended' | 'revoked'

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
  verification_status: ClubVerificationStatus
  verification_requested_at: string | null
  verified_at: string | null
  verified_by_user_id: string | null
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
  verification_status: ClubVerificationStatus
  verification_requested_at: string | null
  verified_at: string | null
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
    created_at: club.created_at,
    verification_status: club.verification_status,
    verification_requested_at: club.verification_requested_at,
    verified_at: club.verified_at
  }
}

export interface ClubSearchQuery {
  q?: string
  province?: string
  city?: string
  limit: number
  offset: number
}

export interface ClubSearchResultDto {
  id: string
  name: string
  slug: string
  description: string | null
  province: string | null
  city: string | null
  verification_status: ClubVerificationStatus
  member_count?: number
}

export function toClubSearchResultDto(
  club: ClubRecord,
  memberCount?: number
): ClubSearchResultDto {
  return {
    id: club.id,
    name: club.name,
    slug: club.slug,
    description: club.description,
    province: club.province,
    city: club.city,
    verification_status: club.verification_status,
    member_count: memberCount
  }
}
