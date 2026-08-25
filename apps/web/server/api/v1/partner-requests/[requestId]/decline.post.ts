import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createPartnershipRepository } from '~/server/domains/partnership/repositories/partnership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import {
  createPartnershipService,
  PartnershipServiceError
} from '~/server/domains/partnership/services/partnership.service'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to decline a partner request.')
  }

  const requestId = getRouterParam(event, 'requestId')
  if (!requestId) {
    throw apiError(400, 'VALIDATION_ERROR', 'requestId is required.')
  }

  const client = serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(claims.sub)

  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const partnershipRepo = createPartnershipRepository(client)
  const service = createPartnershipService(partnershipRepo, playerRepo)

  try {
    // Read before the status changes, so the sender is still recoverable.
    const request = await partnershipRepo.findRequestById(requestId)

    await service.declineRequest(profile.id, requestId)

    // Accept already told the requester; a decline left them watching an
    // outgoing request that had quietly stopped being pending. The wording
    // stays neutral — a decline is not an accusation.
    if (request) {
      const requesterProfile = await playerRepo.findById(request.from_player_id)
      if (requesterProfile) {
        const notificationService = createNotificationService(createNotificationRepository(client))
        await notificationService.notify({
          user_id: requesterProfile.user_id,
          type: 'partner.request_declined',
          title: 'Partner Request Declined',
          body: `${profile.display_name} declined your partner request.`,
          reference_type: 'partnership',
          reference_id: profile.id
        })
      }
    }

    return { message: 'Partner request declined' }
  } catch (err) {
    if (err instanceof PartnershipServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
