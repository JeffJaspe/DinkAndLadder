import type { ClubDto } from './club.dto'

export type ClubRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER'
/**
 * Where a player stands with a club.
 *
 * `pending` and `invited` are the same relationship travelling in opposite
 * directions — the player asked, or the club did (051-club-invitations). Both
 * occupy the one live slot a player may hold per club, so a club cannot invite
 * someone whose request is already waiting.
 */
export type ClubMembershipStatus = 'pending' | 'invited' | 'active' | 'rejected' | 'left'

export interface ClubMembershipRecord {
  id: string
  club_id: string
  player_id: string
  role: ClubRole
  status: ClubMembershipStatus
  joined_at: string | null
  left_at: string | null
  created_at: string
  /** Who sent the invitation. Null on a join request, which has no inviter. */
  invited_by_player_id: string | null
  invited_at: string | null
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
  invited_by_player_id: string | null
  invited_at: string | null
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
    created_at: row.created_at,
    invited_by_player_id: row.invited_by_player_id ?? null,
    invited_at: row.invited_at ?? null
  }
}
