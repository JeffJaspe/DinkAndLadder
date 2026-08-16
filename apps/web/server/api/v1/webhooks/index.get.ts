import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createWebhookRepository, createWebhookService } from '~/server/domains/apikey/services/webhook.service'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.id)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required' })
  }

  const webhookRepo = createWebhookRepository(client)
  const service = createWebhookService(webhookRepo)

  const subscriptions = await service.listSubscriptions(profile.id)

  return {
    subscriptions: subscriptions.map(s => ({
      id: s.id,
      url: s.url,
      events: s.events,
      is_active: s.is_active,
      created_at: s.created_at
    }))
  }
})
