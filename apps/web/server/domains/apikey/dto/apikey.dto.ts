export type ApiKeyPermission = 'read' | 'write'

export interface ApiKeyRecord {
  id: string
  player_id: string
  key_hash: string
  key_prefix: string
  name: string
  permissions: ApiKeyPermission[]
  last_used_at: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

export interface ApiKeyDto {
  id: string
  name: string
  key_prefix: string
  permissions: ApiKeyPermission[]
  last_used_at: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

export interface ApiKeyWithSecretDto extends ApiKeyDto {
  key: string
}

export function toApiKeyDto(record: ApiKeyRecord): ApiKeyDto {
  return {
    id: record.id,
    name: record.name,
    key_prefix: record.key_prefix,
    permissions: record.permissions,
    last_used_at: record.last_used_at,
    expires_at: record.expires_at,
    is_active: record.is_active,
    created_at: record.created_at
  }
}

export interface CreateApiKeyInput {
  name: string
  permissions?: ApiKeyPermission[]
  expires_at?: string
}

export interface WebhookSubscriptionRecord {
  id: string
  player_id: string
  url: string
  secret: string
  events: string[]
  is_active: boolean
  last_triggered_at: string | null
  failure_count: number
  created_at: string
}

export interface WebhookSubscriptionDto {
  id: string
  url: string
  events: string[]
  is_active: boolean
  last_triggered_at: string | null
  failure_count: number
  created_at: string
}

export function toWebhookSubscriptionDto(record: WebhookSubscriptionRecord): WebhookSubscriptionDto {
  return {
    id: record.id,
    url: record.url,
    events: record.events,
    is_active: record.is_active,
    last_triggered_at: record.last_triggered_at,
    failure_count: record.failure_count,
    created_at: record.created_at
  }
}

export interface CreateWebhookInput {
  url: string
  events: string[]
}
