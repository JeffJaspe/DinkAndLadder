import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiKeyRecord, ApiKeyPermission, WebhookSubscriptionRecord } from '../dto/apikey.dto'

const KEY_COLUMNS =
  'id, player_id, key_hash, key_prefix, name, permissions, last_used_at, expires_at, is_active, created_at'
const WEBHOOK_COLUMNS =
  'id, player_id, url, secret, events, is_active, last_triggered_at, failure_count, created_at'

export interface ApiKeyRepository {
  listByPlayer(playerId: string): Promise<ApiKeyRecord[]>
  findByHash(keyHash: string): Promise<ApiKeyRecord | null>
  findById(id: string): Promise<ApiKeyRecord | null>
  create(input: CreateApiKeyRecordInput): Promise<ApiKeyRecord>
  updateLastUsed(id: string): Promise<void>
  deactivate(id: string): Promise<void>
  delete(id: string): Promise<void>
}

export interface CreateApiKeyRecordInput {
  player_id: string
  key_hash: string
  key_prefix: string
  name: string
  permissions: ApiKeyPermission[]
  expires_at?: string
}

export function createApiKeyRepository(client: SupabaseClient): ApiKeyRepository {
  return {
    async listByPlayer(playerId) {
      const { data, error } = await client
        .from('api_keys')
        .select(KEY_COLUMNS)
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as unknown as ApiKeyRecord[]
    },

    async findByHash(keyHash) {
      const { data, error } = await client
        .from('api_keys')
        .select(KEY_COLUMNS)
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ApiKeyRecord | null
    },

    async findById(id) {
      const { data, error } = await client
        .from('api_keys')
        .select(KEY_COLUMNS)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ApiKeyRecord | null
    },

    async create(input) {
      const { data, error } = await client
        .from('api_keys')
        .insert(input)
        .select(KEY_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as ApiKeyRecord
    },

    async updateLastUsed(id) {
      const { error } = await client
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
    },

    async deactivate(id) {
      const { error } = await client.from('api_keys').update({ is_active: false }).eq('id', id)

      if (error) throw error
    },

    async delete(id) {
      const { error } = await client.from('api_keys').delete().eq('id', id)

      if (error) throw error
    }
  }
}

export interface WebhookRepository {
  listByPlayer(playerId: string): Promise<WebhookSubscriptionRecord[]>
  findById(id: string): Promise<WebhookSubscriptionRecord | null>
  findByEvent(event: string): Promise<WebhookSubscriptionRecord[]>
  create(input: CreateWebhookRecordInput): Promise<WebhookSubscriptionRecord>
  updateFailureCount(id: string, count: number): Promise<void>
  updateLastTriggered(id: string): Promise<void>
  deactivate(id: string): Promise<void>
  delete(id: string): Promise<void>
}

export interface CreateWebhookRecordInput {
  player_id: string
  url: string
  secret: string
  events: string[]
}

export function createWebhookRepository(client: SupabaseClient): WebhookRepository {
  return {
    async listByPlayer(playerId) {
      const { data, error } = await client
        .from('webhook_subscriptions')
        .select(WEBHOOK_COLUMNS)
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as unknown as WebhookSubscriptionRecord[]
    },

    async findById(id) {
      const { data, error } = await client
        .from('webhook_subscriptions')
        .select(WEBHOOK_COLUMNS)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return data as unknown as WebhookSubscriptionRecord | null
    },

    async findByEvent(event) {
      const { data, error } = await client
        .from('webhook_subscriptions')
        .select(WEBHOOK_COLUMNS)
        .eq('is_active', true)
        .contains('events', [event])

      if (error) throw error
      return data as unknown as WebhookSubscriptionRecord[]
    },

    async create(input) {
      const { data, error } = await client
        .from('webhook_subscriptions')
        .insert(input)
        .select(WEBHOOK_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as WebhookSubscriptionRecord
    },

    async updateFailureCount(id, count) {
      const { error } = await client
        .from('webhook_subscriptions')
        .update({ failure_count: count })
        .eq('id', id)

      if (error) throw error
    },

    async updateLastTriggered(id) {
      const { error } = await client
        .from('webhook_subscriptions')
        .update({ last_triggered_at: new Date().toISOString(), failure_count: 0 })
        .eq('id', id)

      if (error) throw error
    },

    async deactivate(id) {
      const { error } = await client
        .from('webhook_subscriptions')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
    },

    async delete(id) {
      const { error } = await client.from('webhook_subscriptions').delete().eq('id', id)

      if (error) throw error
    }
  }
}
