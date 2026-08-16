import { createHash, randomBytes } from 'crypto'
import type { ApiKeyRepository, WebhookRepository } from '../repositories/apikey.repository'
import type {
  ApiKeyDto,
  ApiKeyWithSecretDto,
  CreateApiKeyInput,
  WebhookSubscriptionDto,
  CreateWebhookInput,
  ApiKeyPermission
} from '../dto/apikey.dto'
import { toApiKeyDto, toWebhookSubscriptionDto } from '../dto/apikey.dto'

export class ApiKeyServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface ApiKeyService {
  listKeys(playerId: string): Promise<ApiKeyDto[]>
  createKey(playerId: string, input: CreateApiKeyInput): Promise<ApiKeyWithSecretDto>
  revokeKey(playerId: string, keyId: string): Promise<void>
  validateKey(key: string): Promise<{ playerId: string; permissions: ApiKeyPermission[] } | null>
}

export interface WebhookService {
  listWebhooks(playerId: string): Promise<WebhookSubscriptionDto[]>
  createWebhook(playerId: string, input: CreateWebhookInput): Promise<WebhookSubscriptionDto>
  deleteWebhook(playerId: string, webhookId: string): Promise<void>
}

function generateApiKey(): string {
  const prefix = 'dnl_live_'
  const random = randomBytes(24).toString('hex')
  return prefix + random
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex')
}

export function createApiKeyService(repo: ApiKeyRepository): ApiKeyService {
  return {
    async listKeys(playerId) {
      const records = await repo.listByPlayer(playerId)
      return records.map(toApiKeyDto)
    },

    async createKey(playerId, input) {
      const key = generateApiKey()
      const keyHash = hashKey(key)
      const keyPrefix = key.substring(0, 16)

      const record = await repo.create({
        player_id: playerId,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name: input.name,
        permissions: input.permissions ?? ['read'],
        expires_at: input.expires_at
      })

      return {
        ...toApiKeyDto(record),
        key
      }
    },

    async revokeKey(playerId, keyId) {
      const record = await repo.findById(keyId)
      if (!record) {
        throw new ApiKeyServiceError(404, 'NOT_FOUND', 'API key not found')
      }
      if (record.player_id !== playerId) {
        throw new ApiKeyServiceError(403, 'FORBIDDEN', 'Cannot revoke another player\'s key')
      }

      await repo.deactivate(keyId)
    },

    async validateKey(key) {
      if (!key.startsWith('dnl_')) {
        return null
      }

      const keyHash = hashKey(key)
      const record = await repo.findByHash(keyHash)

      if (!record) {
        return null
      }

      if (record.expires_at && new Date(record.expires_at) < new Date()) {
        return null
      }

      await repo.updateLastUsed(record.id)

      return {
        playerId: record.player_id,
        permissions: record.permissions
      }
    }
  }
}

export function createWebhookService(repo: WebhookRepository): WebhookService {
  return {
    async listWebhooks(playerId) {
      const records = await repo.listByPlayer(playerId)
      return records.map(toWebhookSubscriptionDto)
    },

    async createWebhook(playerId, input) {
      if (!input.url.startsWith('https://')) {
        throw new ApiKeyServiceError(400, 'INVALID_URL', 'Webhook URL must use HTTPS')
      }

      const validEvents = ['match.verified', 'rating.changed', 'club.member_joined', 'tournament.registration_opened']
      const invalidEvents = input.events.filter(e => !validEvents.includes(e))
      if (invalidEvents.length > 0) {
        throw new ApiKeyServiceError(400, 'INVALID_EVENTS', `Invalid events: ${invalidEvents.join(', ')}`)
      }

      const secret = generateWebhookSecret()

      const record = await repo.create({
        player_id: playerId,
        url: input.url,
        secret,
        events: input.events
      })

      return toWebhookSubscriptionDto(record)
    },

    async deleteWebhook(playerId, webhookId) {
      const record = await repo.findById(webhookId)
      if (!record) {
        throw new ApiKeyServiceError(404, 'NOT_FOUND', 'Webhook not found')
      }
      if (record.player_id !== playerId) {
        throw new ApiKeyServiceError(403, 'FORBIDDEN', 'Cannot delete another player\'s webhook')
      }

      await repo.delete(webhookId)
    }
  }
}
