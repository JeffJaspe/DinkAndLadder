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
  /**
   * The club asking a player, rather than the other way round (051).
   *
   * Requires the same standing as approving a request — an ordinary member
   * cannot conjure new members — and refuses when any live row already exists,
   * because the unique index allows exactly one and the person deserves a
   * clearer answer than a constraint violation.
   */
  invitePlayer(
    actingPlayerId: string,
    clubId: string,
    targetPlayerId: string
  ): Promise<ClubMembershipDto>
  /** The invited player's answer. Only they can give it. */
  respondToInvite(
    clubId: string,
    playerId: string,
    accept: boolean
  ): Promise<ClubMembershipDto>
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
 *  - MODERATOR: approve/reject PENDING join requests, send invitations, and withdraw an
 *    invitation that has not been answered — and nothing else here: no role changes, no
 *    removals, no acting on an active membership. Also publishes announcements
 *    (see announcement.service.ts, which already admitted the role). Granted 2026-08-23 on the
 *    product's instruction; before that the role was recognised but carried no permissions.
 *  - MEMBER: no admin capabilities; can only leave (see leaveClub, not updateMember).
 *
 * One thing NOBODY on this list may do: accept an invitation on the invited player's behalf.
 * An `invited` row moves to `active` only through respondToInvite, called by that player.
 * Membership without consent is the one outcome the invited status exists to prevent.
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
        // An outstanding invitation is the one case worth naming: the answer is
        // "accept it", not "you already asked", and the two are easy to confuse
        // now that both occupy the same live slot (051).
        if (existing.status === 'invited') {
          throw new ClubServiceError(
            409,
            'INVITED',
            'This club has already invited you. Accept the invitation instead.'
          )
        }
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

    async invitePlayer(actingPlayerId, clubId, targetPlayerId) {
      const acting = await getActiveMembership(clubId, actingPlayerId)
      // Same standing as approving a request: inviting is admitting somebody,
      // just with the order of the two steps reversed.
      if (!acting || !APPROVAL_ROLES.includes(acting.role)) {
        throw new ClubServiceError(
          403,
          'FORBIDDEN',
          'Only the club owner, an admin or a moderator can invite players.'
        )
      }

      if (targetPlayerId === actingPlayerId) {
        throw new ClubServiceError(400, 'INVALID_REQUEST', 'You are already in this club.')
      }

      /**
       * One live row per player per club, so every existing state gets its own
       * answer rather than a unique-index violation.
       */
      const existing = await memberships.findByClubAndPlayer(clubId, targetPlayerId)
      if (existing) {
        if (existing.status === 'active') {
          throw new ClubServiceError(409, 'CONFLICT', 'They are already a member of this club.')
        }
        if (existing.status === 'invited') {
          throw new ClubServiceError(409, 'CONFLICT', 'They have already been invited.')
        }
        // They asked first. Admitting them is the honest resolution — sending an
        // invitation on top would leave both sides waiting for the other.
        throw new ClubServiceError(
          409,
          'REQUEST_PENDING',
          'They have already asked to join. Approve their request instead.'
        )
      }

      const membership = await memberships.create({
        club_id: clubId,
        player_id: targetPlayerId,
        role: 'MEMBER',
        status: 'invited',
        invited_by_player_id: actingPlayerId,
        invited_at: new Date().toISOString()
      })
      return toClubMembershipDto(membership)
    },

    async respondToInvite(clubId, playerId, accept) {
      const membership = await memberships.findByClubAndPlayer(clubId, playerId)
      if (!membership || membership.status !== 'invited') {
        throw new ClubServiceError(
          404,
          'NOT_FOUND',
          'You have no outstanding invitation from this club.'
        )
      }

      const updated = await memberships.updateById(membership.id, {
        status: accept ? 'active' : 'rejected',
        // Membership dates from the acceptance, not from the invitation: the
        // roster's "member since" must not predate their saying yes.
        joined_at: accept ? new Date().toISOString() : null
      })
      return toClubMembershipDto(updated)
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
          'That player has no live membership, request or invitation in this club.'
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

      /**
       * Withdrawing an invitation the club sent (051).
       *
       * Recognised as narrowly as a join-request review, and for the same
       * reason: it is the same class of action, so whoever may send an
       * invitation may take it back. Without this a MODERATOR could invite
       * somebody and then be unable to undo it, since an `invited` row is not
       * `pending` and fell through to the admin-only branch.
       */
      const isInviteWithdrawal =
        target.status === 'invited' && !input.role && input.status === 'rejected'

      /**
       * A club cannot accept its own invitation.
       *
       * `updateMember` will set any status an admin asks for, which on an
       * `invited` row would have let the club move somebody to `active` without
       * them ever answering — a membership nobody consented to, and the exact
       * thing the invited status exists to prevent. Only the invited player can
       * accept, through `respondToInvite`.
       */
      if (target.status === 'invited' && input.status && input.status !== 'rejected') {
        throw new ClubServiceError(
          403,
          'FORBIDDEN',
          'Only the invited player can accept an invitation. You can withdraw it instead.'
        )
      }

      const narrowAction = isJoinRequestReview || isInviteWithdrawal
      const permitted = narrowAction ? APPROVAL_ROLES : ADMIN_ROLES
      if (!acting || !permitted.includes(acting.role)) {
        throw new ClubServiceError(
          403,
          'FORBIDDEN',
          narrowAction
            ? 'Only the club owner, an admin or a moderator can answer join requests and invitations.'
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
