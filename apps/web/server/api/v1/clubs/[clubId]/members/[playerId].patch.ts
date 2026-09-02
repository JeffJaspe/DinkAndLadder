import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubService, ClubServiceError } from '~/server/domains/club/services/club.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createAuditRepository } from '~/server/domains/audit/repositories/audit.repository'
import { createAuditService } from '~/server/domains/audit/services/audit.service'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { apiError } from '~/server/utils/api-error'
import type { UpdateMembershipInput } from '~/server/domains/club/dto/club-membership.dto'
import { getOptionalUser } from '~/server/utils/optional-user'

function parseUpdateInput(body: unknown): UpdateMembershipInput {
  if (typeof body !== 'object' || body === null) {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be an object.')
  }
  const record = body as Record<string, unknown>
  const input: UpdateMembershipInput = {}

  if (record.status !== undefined) {
    if (!['active', 'rejected', 'left'].includes(record.status as string)) {
      throw apiError(400, 'VALIDATION_ERROR', "status must be 'active', 'rejected', or 'left'.")
    }
    input.status = record.status as UpdateMembershipInput['status']
  }
  if (record.role !== undefined) {
    if (!['ADMIN', 'MODERATOR', 'MEMBER'].includes(record.role as string)) {
      throw apiError(400, 'VALIDATION_ERROR', "role must be 'ADMIN', 'MODERATOR', or 'MEMBER'.")
    }
    input.role = record.role as UpdateMembershipInput['role']
  }
  if (!input.status && !input.role) {
    throw apiError(400, 'VALIDATION_ERROR', 'Provide at least one of status or role.')
  }

  return input
}

/**
 * Admin-only mutation of someone else's membership (approve/reject a request, change role,
 * remove). Uses the service-role client — see 008-security's note on why this path isn't
 * RLS-enforced. ClubService.updateMember is where the actual permission matrix lives and is
 * checked before any write happens.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage club members.')
  }

  const clubId = getRouterParam(event, 'clubId')
  const targetPlayerId = getRouterParam(event, 'playerId')
  if (!clubId || !targetPlayerId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId and playerId are required.')
  }

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(403, 'FORBIDDEN', 'You have no player profile, so you cannot be a club admin.')
  }

  const input = parseUpdateInput(await readBody(event))
  const serviceClient = serverSupabaseServiceRole(event)
  const membershipRepo = createClubMembershipRepository(serviceClient)
  const clubRepo = createClubRepository(serviceClient)
  const playerRepo = createPlayerProfileRepository(serviceClient)
  const service = createClubService(clubRepo, membershipRepo)
  const auditService = createAuditService(createAuditRepository(serviceClient))
  const notificationService = createNotificationService(createNotificationRepository(serviceClient))

  const oldMembership = await membershipRepo.findByClubAndPlayer(clubId, targetPlayerId)

  try {
    const membership = await service.updateMember(playerProfile.id, clubId, targetPlayerId, input)

    const targetProfile = await playerRepo.findById(targetPlayerId)
    const club = await clubRepo.findById(clubId)

    if (oldMembership && targetProfile && club) {
      if (input.role && input.role !== oldMembership.role) {
        await auditService.logClubRoleChange(claims.sub, playerProfile.id, membership.id, {
          old_role: oldMembership.role,
          new_role: input.role,
          target_player_id: targetPlayerId
        })
        await notificationService.notify({
          user_id: targetProfile.user_id,
          type: 'club.role_changed',
          title: 'Role Changed',
          body: `Your role in ${club.name} was changed to ${input.role}.`,
          reference_type: 'club_membership',
          reference_id: membership.id
        })
      }
      if (input.status === 'active' && oldMembership.status === 'pending') {
        await auditService.logClubMembershipAction(
          claims.sub,
          playerProfile.id,
          membership.id,
          'approve',
          { target_player_id: targetPlayerId, club_id: clubId }
        )
        await notificationService.notify({
          user_id: targetProfile.user_id,
          type: 'club.membership_approved',
          title: 'Membership Approved',
          body: `Your request to join ${club.name} was approved.`,
          reference_type: 'club_membership',
          reference_id: membership.id
        })
      } else if (input.status === 'rejected' && oldMembership.status === 'invited') {
        /**
         * Withdrawing an invitation, not declining a request (051).
         *
         * Both land on `rejected`, so without this branch the player would be
         * told "your request to join was declined" about a request they never
         * made. It is still audited — the club did something to somebody's
         * standing — but not announced: "we have changed our mind about
         * inviting you" is a message nobody is better off receiving, and the
         * invitation simply disappears from their list.
         */
        await auditService.logClubMembershipAction(
          claims.sub,
          playerProfile.id,
          membership.id,
          'reject',
          { target_player_id: targetPlayerId, club_id: clubId, withdrawn_invitation: true }
        )
      } else if (input.status === 'rejected') {
        await auditService.logClubMembershipAction(
          claims.sub,
          playerProfile.id,
          membership.id,
          'reject',
          { target_player_id: targetPlayerId, club_id: clubId }
        )
        await notificationService.notify({
          user_id: targetProfile.user_id,
          type: 'club.membership_rejected',
          title: 'Membership Rejected',
          body: `Your request to join ${club.name} was declined.`,
          reference_type: 'club_membership',
          reference_id: membership.id
        })
      } else if (input.status === 'left') {
        await auditService.logClubMembershipAction(
          claims.sub,
          playerProfile.id,
          membership.id,
          'remove',
          { target_player_id: targetPlayerId, club_id: clubId }
        )
      }
    }

    return { data: membership, message: 'Member updated', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ClubServiceError) throw apiError(err.status, err.code, err.message)
    console.error(
      `[PATCH /api/v1/clubs/${clubId}/members/${targetPlayerId}] updateMember failed:`,
      err
    )
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update that member.')
  }
})
