import type { ClubDto } from './club.dto'

export type ClubRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER'
export type ClubMembershipStatus = 'pending' | 'active' | 'rejected' | 'left'

export interface ClubMembershipRecord {
  id: string
  club_id: string
  player_id: string
  role: ClubRole
  status: ClubMembershipStatus
  joined_at: string | null
  left_at: string | null
  created_at: string
}

export interface ClubMembershipDto {
  id: string
  club_id: string
  player_id: string
  role: ClubRole
  status: ClubMembershipStatus
  joined_at: string | null
  left_at: string | null
  created_at: string
}

export interface RosterMemberDto extends ClubMembershipDto {
  display_name: string
}

export interface MyClubMembershipDto extends ClubMembershipDto {
  club: ClubDto
}

export interface UpdateMembershipInput {
  status?: ClubMembershipStatus
  role?: ClubRole
}

export function toClubMembershipDto(row: ClubMembershipRecord): ClubMembershipDto {
  return {
    id: row.id,
    club_id: row.club_id,
    player_id: row.player_id,
    role: row.role,
    status: row.status,
    joined_at: row.joined_at,
    left_at: row.left_at,
    created_at: row.created_at
  }
}
