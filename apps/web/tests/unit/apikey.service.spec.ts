import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createApiKeyService,
  ApiKeyServiceError
} from '../../server/domains/apikey/services/apikey.service'
import type { ApiKeyRepository } from '../../server/domains/apikey/repositories/apikey.repository'
import type { ApiKeyRecord } from '../../server/domains/apikey/dto/apikey.dto'

function createMockRepo(): ApiKeyRepository {
  return {
    listByPlayer: vi.fn(),
    findByHash: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateLastUsed: vi.fn(),
    deactivate: vi.fn(),
    delete: vi.fn()
  }
}

function makeKeyRecord(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: 'key-1',
    player_id: 'player-1',
    name: 'Test Key',
    key_hash: 'hash123',
    key_prefix: 'dnl_live_abc',
    permissions: ['read'],
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    last_used_at: null,
    expires_at: null,
    ...overrides
  }
}

describe('ApiKeyService', () => {
  let repo: ApiKeyRepository

  beforeEach(() => {
    repo = createMockRepo()
  })

  describe('listKeys', () => {
    it('should return player keys', async () => {
      const keys = [makeKeyRecord()]
      vi.mocked(repo.listByPlayer).mockResolvedValue(keys)

      const service = createApiKeyService(repo)
      const result = await service.listKeys('player-1')

      expect(repo.listByPlayer).toHaveBeenCalledWith('player-1')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Test Key')
    })

    it('should return empty array if no keys', async () => {
      vi.mocked(repo.listByPlayer).mockResolvedValue([])

      const service = createApiKeyService(repo)
      const result = await service.listKeys('player-1')

      expect(result).toHaveLength(0)
    })
  })

  describe('createKey', () => {
    it('should create a new API key', async () => {
      const createdKey = makeKeyRecord({ name: 'My API Key' })
      vi.mocked(repo.create).mockResolvedValue(createdKey)

      const service = createApiKeyService(repo)
      const result = await service.createKey('player-1', { name: 'My API Key', permissions: ['read'] })

      expect(repo.create).toHaveBeenCalledWith({
        player_id: 'player-1',
        key_hash: expect.any(String),
        key_prefix: expect.stringMatching(/^dnl_live_/),
        name: 'My API Key',
        permissions: ['read'],
        expires_at: undefined
      })
      expect(result.key).toMatch(/^dnl_live_/)
      expect(result.name).toBe('My API Key')
    })

    it('should use default read permissions', async () => {
      const createdKey = makeKeyRecord()
      vi.mocked(repo.create).mockResolvedValue(createdKey)

      const service = createApiKeyService(repo)
      await service.createKey('player-1', { name: 'Test' })

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ permissions: ['read'] })
      )
    })
  })

  describe('revokeKey', () => {
    it('should revoke an active key', async () => {
      const key = makeKeyRecord()
      vi.mocked(repo.findById).mockResolvedValue(key)
      vi.mocked(repo.deactivate).mockResolvedValue()

      const service = createApiKeyService(repo)
      await service.revokeKey('player-1', 'key-1')

      expect(repo.findById).toHaveBeenCalledWith('key-1')
      expect(repo.deactivate).toHaveBeenCalledWith('key-1')
    })

    it('should throw if key not found', async () => {
      vi.mocked(repo.findById).mockResolvedValue(null)

      const service = createApiKeyService(repo)

      await expect(
        service.revokeKey('player-1', 'nonexistent')
      ).rejects.toThrow(ApiKeyServiceError)
    })

    it('should throw if key belongs to another player', async () => {
      const key = makeKeyRecord({ player_id: 'other-player' })
      vi.mocked(repo.findById).mockResolvedValue(key)

      const service = createApiKeyService(repo)

      await expect(
        service.revokeKey('player-1', 'key-1')
      ).rejects.toThrow(ApiKeyServiceError)
    })
  })

  describe('validateKey', () => {
    it('should validate a correct key', async () => {
      const key = makeKeyRecord()
      vi.mocked(repo.findByHash).mockResolvedValue(key)
      vi.mocked(repo.updateLastUsed).mockResolvedValue()

      const service = createApiKeyService(repo)
      const result = await service.validateKey('dnl_live_testapikey123456789012345678901234567890')

      expect(repo.findByHash).toHaveBeenCalledWith(expect.any(String))
      expect(repo.updateLastUsed).toHaveBeenCalledWith('key-1')
      expect(result).not.toBeNull()
      expect(result?.playerId).toBe('player-1')
    })

    it('should return null for non-dnl_ prefix', async () => {
      const service = createApiKeyService(repo)
      const result = await service.validateKey('invalid_key')

      expect(repo.findByHash).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('should return null for invalid key', async () => {
      vi.mocked(repo.findByHash).mockResolvedValue(null)

      const service = createApiKeyService(repo)
      const result = await service.validateKey('dnl_invalidkey')

      expect(result).toBeNull()
    })

    it('should return null for expired key', async () => {
      const key = makeKeyRecord({ expires_at: '2020-01-01T00:00:00Z' })
      vi.mocked(repo.findByHash).mockResolvedValue(key)

      const service = createApiKeyService(repo)
      const result = await service.validateKey('dnl_live_test')

      expect(result).toBeNull()
      expect(repo.updateLastUsed).not.toHaveBeenCalled()
    })
  })
})
