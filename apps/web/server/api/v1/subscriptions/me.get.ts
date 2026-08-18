import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createSubscriptionRepository } from '~/server/domains/payment/repositories/subscription.repository'
import { createSubscriptionService } from '~/server/domains/payment/services/subscription.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required' })
  }

  const subRepo = createSubscriptionRepository(client)
  const service = createSubscriptionService(subRepo)

  const subscription = await service.getPlayerSubscription(profile.id)
  const features = await service.getPlayerFeatures(profile.id)

  return { subscription, features }
})
