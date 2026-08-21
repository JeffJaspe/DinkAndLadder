import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createPartnershipRepository } from '~/server/domains/partnership/repositories/partnership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createPartnershipService } from '~/server/domains/partnership/services/partnership.service'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your partner requests.')
  }

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

  const requests = await service.getIncomingRequests(profile.id)

  return { data: requests }
})
