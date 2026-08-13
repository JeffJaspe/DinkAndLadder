import { beforeEach, describe, expect, it } from 'vitest'
import { createPlayerProfileService } from '../../server/domains/player/services/player-profile.service'
import type { PlayerProfileRepository } from '../../server/domains/player/repositories/player-profile.repository'
import type {
  PlayerProfileRecord,
  UpdatePlayerProfileInput
} from '../../server/domains/player/dto/player-profile.dto'

let idCounter = 0

function createFakePlayerProfileRepository(seed: PlayerProfileRecord[] = []): PlayerProfileRepository {
  const rowsByUserId = new Map(seed.map((row) => [row.user_id, row]))
  const rowsById = new Map(seed.map((row) => [row.id, row]))

  return {
    async findById(profileId) {
      return rowsById.get(profileId) ?? null
    },
    async findByUserId(userId) {
      return rowsByUserId.get(userId) ?? null
    },
    async upsertOwnProfile(userId: string, input: UpdatePlayerProfileInput) {
      const existing = rowsByUserId.get(userId)
      const now = new Date().toISOString()
      const row: PlayerProfileRecord = {
        id: existing?.id ?? `profile-${++idCounter}`,
        user_id: userId,
        display_name: input.display_name,
        first_name: input.first_name ?? existing?.first_name ?? null,
        last_name: input.last_name ?? existing?.last_name ?? null,
        bio: input.bio ?? existing?.bio ?? null,
        province: input.province ?? existing?.province ?? null,
        city: input.city ?? existing?.city ?? null,
        dominant_hand: input.dominant_hand ?? existing?.dominant_hand ?? null,
        preferred_position: input.preferred_position ?? existing?.preferred_position ?? null,
        profile_visibility: input.profile_visibility ?? existing?.profile_visibility ?? 'public',
        created_at: existing?.created_at ?? now,
        updated_at: now
      }
      rowsByUserId.set(userId, row)
      rowsById.set(row.id, row)
      return row
    }
  }
}

describe('PlayerProfileService', () => {
  let repository: PlayerProfileRepository

  beforeEach(() => {
    repository = createFakePlayerProfileRepository()
  })

  it('returns null when a player has not created a profile yet', async () => {
    const service = createPlayerProfileService(repository)

    expect(await service.getOwnProfile('user-1')).toBeNull()
  })

  it('creates a profile on first save and returns it as the mapped DTO', async () => {
    const service = createPlayerProfileService(repository)

    const profile = await service.saveOwnProfile('user-1', { display_name: 'Ada' })

    expect(profile.display_name).toBe('Ada')
    expect(profile.profile_visibility).toBe('public')
    expect(await service.getOwnProfile('user-1')).not.toBeNull()
  })

  it('updates the same profile row on a second save rather than creating a new one', async () => {
    const service = createPlayerProfileService(repository)

    const first = await service.saveOwnProfile('user-1', { display_name: 'Ada' })
    const second = await service.saveOwnProfile('user-1', {
      display_name: 'Ada L.',
      city: 'Manila'
    })

    expect(second.id).toBe(first.id)
    expect(second.display_name).toBe('Ada L.')
    expect(second.city).toBe('Manila')
  })

  it('looks a profile up by its own id, independent of the owning user id', async () => {
    const service = createPlayerProfileService(repository)
    const saved = await service.saveOwnProfile('user-1', { display_name: 'Ada' })

    const found = await service.getById(saved.id)

    expect(found?.display_name).toBe('Ada')
  })

  it('returns null from getById for an unknown profile id', async () => {
    const service = createPlayerProfileService(repository)

    expect(await service.getById('does-not-exist')).toBeNull()
  })
})
