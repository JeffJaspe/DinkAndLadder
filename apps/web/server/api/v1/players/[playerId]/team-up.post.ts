import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createTeamUpRepository } from '~/server/domains/partnership/repositories/team-up.repository'
import {
  createTeamUpService,
  TeamUpServiceError
} from '~/server/domains/partnership/services/team-up.service'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Ask a player to join your team — the roster of people you may register for an
 * open play session.
 *
 * Distinct from a duo partner request: this is directional and about bringing
 * someone to a session, not about pairing up for a doubles draw. A player can
 * reasonably be both, and neither implies the other.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in to build a team.')

  const memberPlayerId = getRouterParam(event, 'playerId')
  if (!memberPlayerId) throw apiError(400, 'VALIDATION_ERROR', 'A player id is required.')

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) throw apiError(403, 'PROFILE_REQUIRED', 'A player profile is required.')

  const body = await readBody<{ message?: string }>(event).catch(() => undefined)
  const serviceClient = serverSupabaseServiceRole(event)
  const service = createTeamUpService(createTeamUpRepository(serviceClient))

  try {
    const request = await service.invite(profile.id, memberPlayerId, body?.message)

    // Being added to somebody else's roster commits your evening — an accepted
    // team-up lets them enter you into a session. That has to announce itself
    // rather than be discovered on the day. The type existed in the enum from
    // the moderation work; nothing had ever emitted it.
    const member = await createPlayerProfileRepository(serviceClient).findById(memberPlayerId)
    if (member) {
      const notifications = createNotificationService(createNotificationRepository(serviceClient))
      await notifications.notify({
        user_id: member.user_id,
        type: 'team_up.invited',
        title: 'Team-up request',
        body: `${profile.display_name} wants to add you to their team, so they can enter you for open play sessions.`,
        reference_type: 'team_up',
        reference_id: request.id
      })
    }

    return { data: request, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof TeamUpServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[POST /api/v1/players/:id/team-up] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not send the team-up request.')
  }
})
