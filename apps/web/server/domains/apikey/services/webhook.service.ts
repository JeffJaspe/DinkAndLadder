import type { SupabaseClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'

export interface WebhookSubscription {
  id: string
  player_id: string
  url: string
  events: string[]
  secret: string
  is_active: boolean
  created_at: string
}

export interface WebhookDelivery {
  id: string
  subscription_id: string
  event_type: string
  payload: Record<string, unknown>
  status: 'pending' | 'success' | 'failed'
  response_code?: number
  response_body?: string
  attempts: number
  created_at: string
  delivered_at?: string
}

export interface WebhookRepository {
  listSubscriptions(playerId: string): Promise<WebhookSubscription[]>
  createSubscription(playerId: string, url: string, events: string[]): Promise<WebhookSubscription>
  deleteSubscription(playerId: string, subscriptionId: string): Promise<void>
  findSubscription(subscriptionId: string): Promise<WebhookSubscription | null>
  createDelivery(subscriptionId: string, eventType: string, payload: Record<string, unknown>): Promise<WebhookDelivery>
  updateDelivery(deliveryId: string, status: 'success' | 'failed', responseCode?: number, responseBody?: string): Promise<void>
  listDeliveries(subscriptionId: string, limit: number): Promise<WebhookDelivery[]>
}

export function createWebhookRepository(client: SupabaseClient): WebhookRepository {
  return {
    async listSubscriptions(playerId) {
      const { data, error } = await client
        .from('webhook_subscriptions')
        .select('*')
        .eq('player_id', playerId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as WebhookSubscription[]
    },

    async createSubscription(playerId, url, events) {
      const secret = createHmac('sha256', Date.now().toString())
        .update(playerId + url)
        .digest('hex')
        .slice(0, 32)

      const { data, error } = await client
        .from('webhook_subscriptions')
        .insert({
          player_id: playerId,
          url,
          events,
          secret,
          is_active: true
        })
        .select()
        .single()

      if (error) throw error
      return data as WebhookSubscription
    },

    async deleteSubscription(playerId, subscriptionId) {
      const { error } = await client
        .from('webhook_subscriptions')
        .update({ is_active: false })
        .eq('id', subscriptionId)
        .eq('player_id', playerId)

      if (error) throw error
    },

    async findSubscription(subscriptionId) {
      const { data, error } = await client
        .from('webhook_subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .maybeSingle()

      if (error) throw error
      return data as WebhookSubscription | null
    },

    async createDelivery(subscriptionId, eventType, payload) {
      const { data, error } = await client
        .from('webhook_deliveries')
        .insert({
          subscription_id: subscriptionId,
          event_type: eventType,
          payload,
          status: 'pending',
          attempts: 0
        })
        .select()
        .single()

      if (error) throw error
      return data as WebhookDelivery
    },

    async updateDelivery(deliveryId, status, responseCode, responseBody) {
      const update: Record<string, unknown> = {
        status,
        attempts: 1
      }
      if (status === 'success') {
        update.delivered_at = new Date().toISOString()
      }
      if (responseCode !== undefined) {
        update.response_code = responseCode
      }
      if (responseBody !== undefined) {
        update.response_body = responseBody.slice(0, 1000)
      }

      const { error } = await client
        .from('webhook_deliveries')
        .update(update)
        .eq('id', deliveryId)

      if (error) throw error
    },

    async listDeliveries(subscriptionId, limit) {
      const { data, error } = await client
        .from('webhook_deliveries')
        .select('*')
        .eq('subscription_id', subscriptionId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data as WebhookDelivery[]
    }
  }
}

export interface WebhookService {
  listSubscriptions(playerId: string): Promise<WebhookSubscription[]>
  createSubscription(playerId: string, url: string, events: string[]): Promise<{ subscription: WebhookSubscription; secret: string }>
  deleteSubscription(playerId: string, subscriptionId: string): Promise<void>
  listDeliveries(playerId: string, subscriptionId: string, limit?: number): Promise<WebhookDelivery[]>
  signPayload(secret: string, payload: string): string
}

export class WebhookServiceError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'WebhookServiceError'
  }
}

const VALID_EVENTS = [
  'match.created',
  'match.verified',
  'ranking.updated',
  'player.followed',
  'club.member_joined'
]

export function createWebhookService(repo: WebhookRepository): WebhookService {
  return {
    async listSubscriptions(playerId) {
      return repo.listSubscriptions(playerId)
    },

    async createSubscription(playerId, url, events) {
      if (!url.startsWith('https://')) {
        throw new WebhookServiceError('Webhook URL must use HTTPS', 400)
      }

      const invalidEvents = events.filter(e => !VALID_EVENTS.includes(e))
      if (invalidEvents.length > 0) {
        throw new WebhookServiceError(`Invalid events: ${invalidEvents.join(', ')}`, 400)
      }

      const subscription = await repo.createSubscription(playerId, url, events)
      return { subscription, secret: subscription.secret }
    },

    async deleteSubscription(playerId, subscriptionId) {
      await repo.deleteSubscription(playerId, subscriptionId)
    },

    async listDeliveries(playerId, subscriptionId, limit = 50) {
      const subscription = await repo.findSubscription(subscriptionId)
      if (!subscription || subscription.player_id !== playerId) {
        throw new WebhookServiceError('Subscription not found', 404)
      }
      return repo.listDeliveries(subscriptionId, limit)
    },

    signPayload(secret, payload) {
      return createHmac('sha256', secret).update(payload).digest('hex')
    }
  }
}
