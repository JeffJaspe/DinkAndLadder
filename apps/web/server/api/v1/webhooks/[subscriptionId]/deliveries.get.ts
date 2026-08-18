import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import {
  createWebhookRepository,
  createWebhookService,
  WebhookServiceError
} from '~/server/domains/apikey/services/webhook.service'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const subscriptionId = getRouterParam(event, 'subscriptionId')
  if (!subscriptionId) {
    throw createError({ statusCode: 400, statusMessage: 'subscriptionId is required' })
  }

  const query = getQuery(event)
  const limit = Math.min(parseInt(query.limit as string) || 50, 100)

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required' })
  }

  const webhookRepo = createWebhookRepository(client)
  const service = createWebhookService(webhookRepo)

  try {
    const deliveries = await service.listDeliveries(profile.id, subscriptionId, limit)
    return { deliveries }
  } catch (err) {
    if (err instanceof WebhookServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
