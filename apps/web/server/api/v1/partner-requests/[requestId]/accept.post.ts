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
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to accept a partner request.')
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
  const service = createPartnershipService(
    partnershipRepo,
    playerRepo,
    createRatingRepository(client)
  )

  try {
    // Get the request first to know who sent it
    const request = await partnershipRepo.findRequestById(requestId)

    const partner = await service.acceptRequest(profile.id, requestId)

    // Send notification to the requester
    if (request) {
      const requesterProfile = await playerRepo.findById(request.from_player_id)
      if (requesterProfile) {
        const notificationService = createNotificationService(
          createNotificationRepository(client)
        )
        await notificationService.notify({
          user_id: requesterProfile.user_id,
          type: 'partner.request_accepted' as any,
          title: 'Partner Request Accepted',
          body: `${profile.display_name} accepted your partner request!`,
          reference_type: 'partnership' as any,
          reference_id: profile.id
        })
      }
    }

    return { data: partner, message: 'Partner request accepted' }
  } catch (err) {
    if (err instanceof PartnershipServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
