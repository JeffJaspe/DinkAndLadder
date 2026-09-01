import { serverSupabaseServiceRole } from '#supabase/server'
import { createPartnershipRepository } from '~/server/domains/partnership/repositories/partnership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import {
  createPartnershipService,
  PartnershipServiceError
} from '~/server/domains/partnership/services/partnership.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to remove a partner.')
  }

  const partnerId = getRouterParam(event, 'partnerId')
  if (!partnerId) {
    throw apiError(400, 'VALIDATION_ERROR', 'partnerId is required.')
  }

  const client = serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(claims.sub)

  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const service = createPartnershipService(createPartnershipRepository(client), playerRepo)

  try {
    await service.removePartner(profile.id, partnerId)
    return { message: 'Partner removed' }
  } catch (err) {
    if (err instanceof PartnershipServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
