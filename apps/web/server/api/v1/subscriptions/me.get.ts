import { serverSupabaseClient } from '#supabase/server'
import { createSubscriptionRepository } from '~/server/domains/payment/repositories/subscription.repository'
import { createSubscriptionService } from '~/server/domains/payment/services/subscription.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const subRepo = createSubscriptionRepository(client)
  const service = createSubscriptionService(subRepo)

  const subscription = await service.getPlayerSubscription(profile.id)
  const features = await service.getPlayerFeatures(profile.id)

  return { subscription, features }
})
