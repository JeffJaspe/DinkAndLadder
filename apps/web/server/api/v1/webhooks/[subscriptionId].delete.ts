import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createWebhookRepository, createWebhookService } from '~/server/domains/apikey/services/webhook.service'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const subscriptionId = getRouterParam(event, 'subscriptionId')
  if (!subscriptionId) {
    throw createError({ statusCode: 400, statusMessage: 'subscriptionId is required' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.id)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required' })
  }

  const webhookRepo = createWebhookRepository(client)
  const service = createWebhookService(webhookRepo)

  await service.deleteSubscription(profile.id, subscriptionId)
  return { success: true }
})
