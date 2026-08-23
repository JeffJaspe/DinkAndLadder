import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createPartnershipRepository } from '~/server/domains/partnership/repositories/partnership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createPartnershipService, PartnershipServiceError } from '~/server/domains/partnership/services/partnership.service'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to send a partner request.')
  }

  const targetPlayerId = getRouterParam(event, 'playerId')
  if (!targetPlayerId) {
    throw apiError(400, 'VALIDATION_ERROR', 'playerId is required.')
  }

  const body = await readBody(event)
  const message = typeof body?.message === 'string' ? body.message : undefined

  const client = serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(claims.sub)

  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const service = createPartnershipService(
    createPartnershipRepository(client),
    playerRepo,
    createRatingRepository(client)
  )

  try {
    const request = await service.sendRequest(profile.id, targetPlayerId, message)

    // Send notification to the target player
    const targetProfile = await playerRepo.findById(targetPlayerId)
    if (targetProfile) {
      const notificationService = createNotificationService(
        createNotificationRepository(client)
      )
      await notificationService.notify({
        user_id: targetProfile.user_id,
        type: 'partner.request_received',
        title: 'New Partner Request',
        body: `${profile.display_name} wants to be your partner.`,
        reference_type: 'partner_request',
        reference_id: request.id
      })
    }

    return { data: request, message: 'Partner request sent' }
  } catch (err) {
    if (err instanceof PartnershipServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
