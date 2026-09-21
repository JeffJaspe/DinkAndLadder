import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPlayerAvatarService,
  PlayerAvatarServiceError
} from '../../server/domains/player/services/player-avatar.service'
import type { PlayerAvatarService } from '../../server/domains/player/services/player-avatar.service'
import type { PlayerProfileRepository } from '../../server/domains/player/repositories/player-profile.repository'
import type { PlayerProfileRecord } from '../../server/domains/player/dto/player-profile.dto'
import type { BrandingAssetRepository } from '../../server/domains/platform/repositories/branding-asset.repository'

const OWNER_USER_ID = 'user-1'

function profileRecord(overrides: Partial<PlayerProfileRecord> = {}): PlayerProfileRecord {
  return {
    id: 'profile-1',
    user_id: OWNER_USER_ID,
    display_name: 'Ana Reyes',
    first_name: null,
    last_name: null,
    bio: null,
    province: null,
    city: null,
    barangay: null,
    dominant_hand: null,
    preferred_position: null,
    profile_visibility: 'public',
    show_match_history: false,
    avatar_path: null,
    social_facebook: null,
    social_instagram: null,
    social_x: null,
    social_tiktok: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function fakeProfiles(seed: PlayerProfileRecord | null) {
  let row = seed
  const repository = {
    async findById() {
      return row
    },
    async findByIds() {
      return []
    },
    async findByUserId(userId: string) {
      return row && row.user_id === userId ? row : null
    },
    async upsertOwnProfile() {
      throw new Error('not used')
    },
    async updateAvatarPath(_profileId: string, avatarPath: string | null) {
      if (!row) throw new Error('no such profile')
      row = { ...row, avatar_path: avatarPath }
      return row
    },
    async search() {
      return []
    }
  } as unknown as PlayerProfileRepository

  return { repository, current: () => row }
}

function fakeAssets() {
  const uploaded: { path: string; contentType: string; size: number }[] = []
  const removed: string[] = []
  const repository: BrandingAssetRepository = {
    async upload(path, body, contentType) {
      uploaded.push({ path, contentType, size: body.length })
      return path
    },
    async remove(path) {
      removed.push(path)
    },
    async resolveUrl(path) {
      return `https://cdn.test/${path}`
    }
  }
  return { repository, uploaded, removed }
}

const PNG = { contentType: 'image/png', bytes: Buffer.from('not-really-a-png') }

describe('PlayerAvatarService', () => {
  let assets: ReturnType<typeof fakeAssets>
  let profiles: ReturnType<typeof fakeProfiles>
  let service: PlayerAvatarService

  beforeEach(() => {
    assets = fakeAssets()
    profiles = fakeProfiles(profileRecord())
    service = createPlayerAvatarService(profiles.repository, assets.repository)
  })

  it('stores the object under the profile id and points the row at it', async () => {
    const result = await service.upload(OWNER_USER_ID, PNG)

    expect(assets.uploaded).toHaveLength(1)
    // The profile id, not the user id: the storage path must not leak the auth
    // subject, and every other asset path in the product is entity-keyed.
    expect(assets.uploaded[0]!.path).toMatch(/^players\/profile-1\/avatar-\d+\.png$/)
    expect(profiles.current()!.avatar_path).toBe(assets.uploaded[0]!.path)
    expect(result.avatar_url).toBe(`https://cdn.test/${assets.uploaded[0]!.path}`)
  })

  it('gives a replacement a new object name and deletes the previous one', async () => {
    profiles = fakeProfiles(profileRecord({ avatar_path: 'players/profile-1/avatar-1.png' }))
    service = createPlayerAvatarService(profiles.repository, assets.repository)

    await service.upload(OWNER_USER_ID, PNG)

    // A stable key would keep a CDN serving the old bytes for its whole cache
    // lifetime, which is why the path carries a timestamp.
    expect(assets.uploaded[0]!.path).not.toBe('players/profile-1/avatar-1.png')
    expect(assets.removed).toEqual(['players/profile-1/avatar-1.png'])
  })

  it('deletes the old object only after the row has been repointed', async () => {
    const order: string[] = []
    profiles = fakeProfiles(profileRecord({ avatar_path: 'players/profile-1/old.png' }))
    const repository = {
      ...profiles.repository,
      async updateAvatarPath(profileId: string, avatarPath: string | null) {
        order.push('update')
        return profiles.repository.updateAvatarPath(profileId, avatarPath)
      }
    } as PlayerProfileRepository
    const tracked: BrandingAssetRepository = {
      ...assets.repository,
      async remove(path) {
        order.push('remove')
        return assets.repository.remove(path)
      }
    }

    await createPlayerAvatarService(repository, tracked).upload(OWNER_USER_ID, PNG)

    expect(order).toEqual(['update', 'remove'])
  })

  it('refuses a type the bucket does not accept', async () => {
    await expect(
      service.upload(OWNER_USER_ID, { contentType: 'image/svg+xml', bytes: Buffer.from('<svg/>') })
    ).rejects.toMatchObject({ status: 415 })
    expect(assets.uploaded).toHaveLength(0)
  })

  it('refuses an empty file', async () => {
    await expect(
      service.upload(OWNER_USER_ID, { contentType: 'image/png', bytes: Buffer.alloc(0) })
    ).rejects.toBeInstanceOf(PlayerAvatarServiceError)
    expect(assets.uploaded).toHaveLength(0)
  })

  it('refuses a file over the bucket ceiling', async () => {
    await expect(
      service.upload(OWNER_USER_ID, {
        contentType: 'image/png',
        bytes: Buffer.alloc(50 * 1024 * 1024 + 1)
      })
    ).rejects.toMatchObject({ status: 413 })
    expect(assets.uploaded).toHaveLength(0)
  })

  it('refuses a user with no profile rather than creating one', async () => {
    profiles = fakeProfiles(null)
    service = createPlayerAvatarService(profiles.repository, assets.repository)

    await expect(service.upload(OWNER_USER_ID, PNG)).rejects.toMatchObject({ status: 404 })
  })

  it('clears the path and deletes the object', async () => {
    profiles = fakeProfiles(profileRecord({ avatar_path: 'players/profile-1/avatar-1.png' }))
    service = createPlayerAvatarService(profiles.repository, assets.repository)

    const result = await service.clear(OWNER_USER_ID)

    expect(profiles.current()!.avatar_path).toBeNull()
    expect(assets.removed).toEqual(['players/profile-1/avatar-1.png'])
    // Back to the initials avatar, which is a finished design rather than a
    // placeholder — so null is the correct answer, not a fallback URL.
    expect(result.avatar_url).toBeNull()
  })

  it('leaves avatar_url null when there is no stored path', async () => {
    const dto = await service.withAvatarUrl({ avatar_url: null } as never, null)
    expect(dto.avatar_url).toBeNull()
  })

  describe('importFromUrl', () => {
    it('downloads and stores an external image', async () => {
      const imageBytes = Buffer.from('fake-image-bytes')
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: () => Promise.resolve(imageBytes.buffer)
      } as Response)

      const result = await service.importFromUrl('profile-1', 'https://example.com/photo.jpg')

      expect(fetchSpy).toHaveBeenCalledWith('https://example.com/photo.jpg', expect.any(Object))
      expect(result).toMatch(/^players\/profile-1\/avatar-\d+\.jpg$/)
      expect(assets.uploaded).toHaveLength(1)
      expect(profiles.current()!.avatar_path).toBe(result)

      fetchSpy.mockRestore()
    })

    it('returns null on fetch failure', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404
      } as Response)

      const result = await service.importFromUrl('profile-1', 'https://example.com/missing.jpg')

      expect(result).toBeNull()
      expect(assets.uploaded).toHaveLength(0)

      fetchSpy.mockRestore()
    })

    it('returns null on network error', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new Error('Network error'))

      const result = await service.importFromUrl('profile-1', 'https://example.com/photo.jpg')

      expect(result).toBeNull()
      expect(assets.uploaded).toHaveLength(0)

      fetchSpy.mockRestore()
    })

    it('returns null for empty response', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0))
      } as Response)

      const result = await service.importFromUrl('profile-1', 'https://example.com/empty.png')

      expect(result).toBeNull()
      expect(assets.uploaded).toHaveLength(0)

      fetchSpy.mockRestore()
    })
  })
})
