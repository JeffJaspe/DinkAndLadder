import type { ClubRepository, UpdateClubInput } from '../repositories/club.repository'
import type {
  ClubMembershipRepository,
  UpdateMembershipRecordInput
} from '../repositories/club-membership.repository'
import type { ClubDto, CreateClubInput } from '../dto/club.dto'
import { toClubDto } from '../dto/club.dto'
import type {
  ClubMembershipDto,
  ClubRole,
  MyClubMembershipDto,
  RosterMemberDto,
  UpdateMembershipInput
} from '../dto/club-membership.dto'
import { toClubMembershipDto } from '../dto/club-membership.dto'

export class ClubServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

const ADMIN_ROLES: ClubRole[] = ['OWNER', 'ADMIN']

/**
 * Who may act on a pending join request.
 *
 * Wider than ADMIN_ROLES by one role, and deliberately so (product decision,
 * 2026-08-23): letting someone into the club is the one membership action with
 * a person waiting on the other end of it, and moderators exist to absorb
 * exactly that kind of routine queue. It stays narrow in every other direction —
 * a MODERATOR may admit or turn away someone who asked to join, and may not
 * change anyone's role, remove anyone, or touch a membership that is not
 * pending. Those remain ADMIN_ROLES.
 */
const APPROVAL_ROLES: ClubRole[] = ['OWNER', 'ADMIN', 'MODERATOR']

export interface ClubService {
  createClub(userId: string, playerId: string, input: CreateClubInput): Promise<ClubDto>
  getClub(clubId: string): Promise<ClubDto | null>
  updateClub(actingPlayerId: string, clubId: string, patch: UpdateClubInput): Promise<ClubDto>
  requestToJoin(clubId: string, playerId: string): Promise<ClubMembershipDto>
  leaveClub(clubId: string, playerId: string): Promise<ClubMembershipDto>
  listMine(playerId: string): Promise<MyClubMembershipDto[]>
  listRoster(actingPlayerId: string, clubId: string): Promise<RosterMemberDto[]>
  updateMember(
    actingPlayerId: string,
    clubId: string,
    targetPlayerId: string,
    input: UpdateMembershipInput
  ): Promise<ClubMembershipDto>
}

/**
 * Permission matrix (spec: "Exact permission matrix must be implemented explicitly"):
 *  - OWNER: approve/reject requests, promote/demote MEMBER/MODERATOR/ADMIN, remove anyone but itself.
 *  - ADMIN: approve/reject requests, promote/demote between MEMBER and MODERATOR only, remove
 *           MEMBER/MODERATOR. Cannot touch OWNER or other ADMIN rows, cannot grant ADMIN.
 *  - MODERATOR: approve/reject PENDING join requests, and nothing else here — no role changes,
 *    no removals, no acting on a membership that is not pending. Also publishes announcements
 *    (see announcement.service.ts, which already admitted the role). Granted 2026-08-23 on the
 *    product's instruction; before that the role was recognised but carried no permissions.
 *  - MEMBER: no admin capabilities; can only leave (see leaveClub, not updateMember).
 * Admin-side removal reuses status 'left' rather than a separate 'removed' value — same terminal
 * state either way; splitting voluntary-leave from kicked is a product decision for later.
 */
export function createClubService(
  clubs: ClubRepository,
  memberships: ClubMembershipRepository
): ClubService {
  async function getActiveMembership(clubId: string, playerId: string) {
    const membership = await memberships.findByClubAndPlayer(clubId, playerId)
    return membership && membership.status === 'active' ? membership : null
  }

  return {
    async createClub(userId, playerId, input) {
      const club = await clubs.create(input, userId)
      await memberships.create({
        club_id: club.id,
        player_id: playerId,
        role: 'OWNER',
        status: 'active',
        joined_at: new Date().toISOString()
      })
      return toClubDto(club)
    },

    async getClub(clubId) {
      const club = await clubs.findById(clubId)
      return club ? toClubDto(club) : null
    },

    async updateClub(actingPlayerId, clubId, patch) {
      const acting = await getActiveMembership(clubId, actingPlayerId)
      if (!acting || !ADMIN_ROLES.includes(acting.role)) {
        throw new ClubServiceError(
          403,
          'FORBIDDEN',
          'Only the club owner or an admin can edit this club.'
        )
      }
      const club = await clubs.update(clubId, patch)
      return toClubDto(club)
    },

    async requestToJoin(clubId, playerId) {
      const existing = await memberships.findByClubAndPlayer(clubId, playerId)
      if (existing) {
        throw new ClubServiceError(
          409,
          'CONFLICT',
          'You already have a pending or active membership in this club.'
        )
      }
      const membership = await memberships.create({
        club_id: clubId,
        player_id: playerId,
        role: 'MEMBER',
        status: 'pending'
      })
      return toClubMembershipDto(membership)
    },

    async leaveClub(clubId, playerId) {
      const membership = await memberships.findByClubAndPlayer(clubId, playerId)
      if (!membership) {
        throw new ClubServiceError(404, 'NOT_FOUND', 'You are not a member of this club.')
      }
      if (membership.role === 'OWNER') {
        throw new ClubServiceError(
          409,
          'INVALID_MEMBER_STATE',
          'The owner cannot leave their own club. Ownership transfer is not supported yet.'
        )
      }
      const updated = await memberships.updateById(membership.id, {
        status: 'left',
        left_at: new Date().toISOString()
      })
      return toClubMembershipDto(updated)
    },

    async listMine(playerId) {
      const rows = await memberships.listOwnWithClub(playerId)
      return rows.map((row) => ({ ...toClubMembershipDto(row), club: toClubDto(row.club) }))
    },

    async listRoster(actingPlayerId, clubId) {
      const membership = await getActiveMembership(clubId, actingPlayerId)
      if (!membership) {
        throw new ClubServiceError(
          403,
          'FORBIDDEN',
          'Only active members can view this club roster.'
        )
      }
      const roster = await memberships.listByClub(clubId)
      return roster.map((row) => ({ ...toClubMembershipDto(row), display_name: row.display_name }))
    },

    async updateMember(actingPlayerId, clubId, targetPlayerId, input) {
      const target = await memberships.findByClubAndPlayer(clubId, targetPlayerId)
      if (!target) {
        throw new ClubServiceError(
          404,
          'NOT_FOUND',
          'That player has no pending or active membership in this club.'
        )
      }

      if (actingPlayerId === targetPlayerId) {
        throw new ClubServiceError(
          400,
          'VALIDATION_ERROR',
          'Use the leave-club action to change your own membership, not this one.'
        )
      }

      const acting = await getActiveMembership(clubId, actingPlayerId)

      /**
       * Reviewing a join request is the one action a MODERATOR may take here.
       * It is recognised narrowly: the target must actually be pending, and the
       * only status changes allowed are admitting or turning them away. A
       * request to change a role, remove a member, or reinstate someone who has
       * already left is not a review, whatever its status field says.
       */
      const isJoinRequestReview =
        target.status === 'pending' &&
        !input.role &&
        (input.status === 'active' || input.status === 'rejected')

      const permitted = isJoinRequestReview ? APPROVAL_ROLES : ADMIN_ROLES
      if (!acting || !permitted.includes(acting.role)) {
        throw new ClubServiceError(
          403,
          'FORBIDDEN',
          isJoinRequestReview
            ? 'Only the club owner, an admin or a moderator can review join requests.'
            : 'Only the club owner or an admin can manage members.'
        )
      }

      if (target.role === 'OWNER') {
        throw new ClubServiceError(
          403,
          'FORBIDDEN',
          'The owner cannot be modified or removed this way.'
        )
      }
      if (acting.role === 'ADMIN' && target.role === 'ADMIN') {
        throw new ClubServiceError(403, 'FORBIDDEN', 'Admins cannot modify other admins.')
      }
      if (acting.role === 'ADMIN' && input.role === 'ADMIN') {
        throw new ClubServiceError(403, 'FORBIDDEN', 'Only the owner can grant admin.')
      }

      const patch: UpdateMembershipRecordInput = {}
      if (input.role) patch.role = input.role
      if (input.status) {
        patch.status = input.status
        if (input.status === 'active' && target.status === 'pending') {
          patch.joined_at = new Date().toISOString()
        }
        if (input.status === 'left') {
          patch.left_at = new Date().toISOString()
        }
      }

      const updated = await memberships.updateById(target.id, patch)
      return toClubMembershipDto(updated)
    }
  }
}
