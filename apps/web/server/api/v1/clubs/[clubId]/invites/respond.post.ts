import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubService, ClubServiceError } from '~/server/domains/club/services/club.service'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

interface RespondBody {
  accept?: boolean
}

/**
 * Accept or decline a club's invitation.
 *
 * Only the invited player may answer, which the service enforces by looking up
 * the invitation by *their* id rather than trusting a membership id from the
 * body — an id in a request body names a row, not a person.
 *
 * Only the acceptance is announced back to the club. Telling an owner they were
 * turned down invites them to ask why, and the answer is nobody's business;
 * the same reasoning the team-up decline already follows.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to answer an invitation.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }

  const body = await readBody<RespondBody>(event)
  if (typeof body?.accept !== 'boolean') {
    throw apiError(400, 'VALIDATION_ERROR', 'accept must be true or false.')
  }

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createClubService(
    createClubRepository(serviceClient),
    createClubMembershipRepository(serviceClient)
  )

  try {
    const membership = await service.respondToInvite(clubId, profile.id, body.accept)

    if (body.accept && membership.invited_by_player_id) {
      const [club, inviter] = await Promise.all([
        createClubRepository(serviceClient).findById(clubId),
        createPlayerProfileRepository(serviceClient).findById(membership.invited_by_player_id)
      ])

      if (club && inviter) {
        await createNotificationService(createNotificationRepository(serviceClient))
          .notify({
            user_id: inviter.user_id,
            type: 'club.membership_request',
            title: 'Invitation accepted',
            body: `${profile.display_name} joined ${club.name}.`,
            reference_type: 'club_membership',
            reference_id: membership.id
          })
          .catch(() => {})
      }
    }

    return {
      data: membership,
      message: body.accept ? 'You joined the club.' : 'Invitation declined.',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    if (err instanceof ClubServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    console.error('[POST /api/v1/clubs/:clubId/invites/respond] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not answer that invitation.')
  }
})
