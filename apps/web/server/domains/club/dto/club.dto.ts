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
  barangay: string | null
  court_name: string | null
  court_address: string | null
  visibility: ClubVisibility
  status: ClubStatus
  created_by_user_id: string
  created_at: string
  verification_status: ClubVerificationStatus
  verification_requested_at: string | null
  verified_at: string | null
  verified_by_user_id: string | null
  /**
   * Bucket-relative paths, not URLs - the URL shape depends on whether the
   * bucket is public, which is a deployment decision (see 025-platform-branding).
   * NULL means "use the generated cover art from the club name".
   */
  cover_photo_path: string | null
  logo_path: string | null
}

export interface ClubDto {
  id: string
  name: string
  slug: string
  description: string | null
  province: string | null
  city: string | null
  barangay: string | null
  court_name: string | null
  court_address: string | null
  visibility: ClubVisibility
  status: ClubStatus
  created_at: string
  verification_status: ClubVerificationStatus
  verification_requested_at: string | null
  verified_at: string | null
  /** Resolved to a public URL by the read path; null falls back to UiCoverArt. */
  cover_photo_url: string | null
  logo_url: string | null
}

export interface CreateClubInput {
  name: string
  slug: string
  description?: string | null
  province?: string | null
  city?: string | null
  barangay?: string | null
  court_name?: string | null
  court_address?: string | null
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
    barangay: club.barangay,
    court_name: club.court_name,
    court_address: club.court_address,
    visibility: club.visibility,
    status: club.status,
    created_at: club.created_at,
    verification_status: club.verification_status,
    verification_requested_at: club.verification_requested_at,
    verified_at: club.verified_at,
    // Resolved by the caller that has a Supabase client to hand; the DTO
    // mapper is pure and has no way to build a storage URL.
    cover_photo_url: null,
    logo_url: null
  }
}

export interface ClubSearchQuery {
  q?: string
  province?: string
  city?: string
  limit: number
  offset: number
  /** Narrow to platform-verified clubs (verification_status = 'verified'). */
  verified?: boolean
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

export function toClubSearchResultDto(club: ClubRecord, memberCount?: number): ClubSearchResultDto {
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
