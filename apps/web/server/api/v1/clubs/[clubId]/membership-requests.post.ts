import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubService, ClubServiceError } from '~/server/domains/club/services/club.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Self-service — the user-scoped client is enough. club_memberships_insert_own's WITH
 * CHECK is what actually enforces "requests always start pending", not this controller.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to request to join a club.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }

  const client = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(
      409,
      'PLAYER_PROFILE_REQUIRED',
      'Complete your player profile before joining a club.'
    )
  }

  const service = createClubService(
    createClubRepository(client),
    createClubMembershipRepository(client)
  )

  try {
    const membership = await service.requestToJoin(clubId, playerProfile.id)

    // Notify club admins about the new membership request (best-effort)
    const serviceClient = serverSupabaseServiceRole(event)
    const clubRepo = createClubRepository(serviceClient)
    const membershipRepo = createClubMembershipRepository(serviceClient)
    const playerRepo = createPlayerProfileRepository(serviceClient)
    const notificationService = createNotificationService(
      createNotificationRepository(serviceClient)
    )

    const club = await clubRepo.findById(clubId)
    if (club) {
      // Get all active admins (OWNER and ADMIN roles)
      const roster = await membershipRepo.listByClub(clubId)
      const admins = roster.filter(
        (m) => ['OWNER', 'ADMIN'].includes(m.role) && m.status === 'active'
      )

      // Send notification to each admin
      const adminNotifications = await Promise.all(
        admins.map(async (admin) => {
          const adminProfile = await playerRepo.findById(admin.player_id)
          if (!adminProfile) return null
          return {
            user_id: adminProfile.user_id,
            type: 'club.membership_request' as const,
            title: 'New Membership Request',
            body: `${playerProfile.display_name} has requested to join ${club.name}.`,
            reference_type: 'club_membership' as const,
            reference_id: membership.id
          }
        })
      )

      await notificationService.notifyMany(
        adminNotifications.filter((n): n is NonNullable<typeof n> => n !== null)
      )
    }

    return { data: membership, message: 'Membership requested', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ClubServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/clubs/${clubId}/membership-requests] requestToJoin failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not submit the membership request.')
  }
})
