import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubService, ClubServiceError } from '~/server/domains/club/services/club.service'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

interface InviteBody {
  player_id?: string
}

/**
 * Invite a player to a club.
 *
 * The other half of `membership-requests.post.ts`: that one is a player asking
 * a club, this is a club asking a player. Before it existed, "Invite to club"
 * on a player's profile was a link to the club page and nothing more — a club
 * could only ever wait to be asked.
 *
 * Service-role client for the write, because the acting player is not
 * necessarily able to see the target's row under their own RLS, and the
 * permission check the service performs is the real boundary. The caller's own
 * identity is resolved with their client first, never taken from the body.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to invite players.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }

  const body = await readBody<InviteBody>(event)
  const targetPlayerId = typeof body?.player_id === 'string' ? body.player_id.trim() : ''
  if (!targetPlayerId) {
    throw apiError(400, 'VALIDATION_ERROR', 'player_id is required.')
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
    const membership = await service.invitePlayer(profile.id, clubId, targetPlayerId)

    /**
     * The invitation is worthless if nobody hears about it.
     *
     * Best-effort: the membership row is the invitation, and a failed
     * notification must not roll it back or fail the request — the player will
     * still see it on their clubs page.
     */
    const [club, targetProfile] = await Promise.all([
      createClubRepository(serviceClient).findById(clubId),
      createPlayerProfileRepository(serviceClient).findById(targetPlayerId)
    ])

    if (club && targetProfile) {
      await createNotificationService(createNotificationRepository(serviceClient))
        .notify({
          user_id: targetProfile.user_id,
          type: 'club.invited',
          title: `${club.name} invited you`,
          body: `${profile.display_name} invited you to join ${club.name}.`,
          reference_type: 'club_membership',
          reference_id: membership.id
        })
        .catch(() => {})
    }

    return { data: membership, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ClubServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    console.error('[POST /api/v1/clubs/:clubId/invites] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not send that invitation.')
  }
})
