import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import {
  createWebhookRepository,
  createWebhookService,
  WebhookServiceError
} from '~/server/domains/apikey/services/webhook.service'

interface CreateWebhookBody {
  url: string
  events: string[]
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<CreateWebhookBody>(event)
  if (!body.url || !body.events?.length) {
    throw createError({ statusCode: 400, statusMessage: 'url and events are required' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required' })
  }

  const webhookRepo = createWebhookRepository(client)
  const service = createWebhookService(webhookRepo)

  try {
    const { subscription, secret } = await service.createSubscription(profile.id, body.url, body.events)
    return {
      id: subscription.id,
      url: subscription.url,
      events: subscription.events,
      secret,
      created_at: subscription.created_at
    }
  } catch (err) {
    if (err instanceof WebhookServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
