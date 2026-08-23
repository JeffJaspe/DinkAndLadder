import { beforeEach, describe, expect, it } from 'vitest'
import { createPlayerProfileService } from '../../server/domains/player/services/player-profile.service'
import type { PlayerProfileRepository } from '../../server/domains/player/repositories/player-profile.repository'
import { PlayerProfileValidationError } from '../../server/domains/player/dto/player-profile.dto'
import type {
  PlayerProfileRecord,
  UpdatePlayerProfileInput
} from '../../server/domains/player/dto/player-profile.dto'

let idCounter = 0

function createFakePlayerProfileRepository(
  seed: PlayerProfileRecord[] = []
): PlayerProfileRepository {
  const rowsByUserId = new Map(seed.map((row) => [row.user_id, row]))
  const rowsById = new Map(seed.map((row) => [row.id, row]))

  return {
    async findById(profileId) {
      return rowsById.get(profileId) ?? null
    },
    async findByIds() {
      return []
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
        barangay: input.barangay ?? existing?.barangay ?? null,
        dominant_hand: input.dominant_hand ?? existing?.dominant_hand ?? null,
        preferred_position: input.preferred_position ?? existing?.preferred_position ?? null,
        profile_visibility: input.profile_visibility ?? existing?.profile_visibility ?? 'public',
        created_at: existing?.created_at ?? now,
        updated_at: now
      }
      rowsByUserId.set(userId, row)
      rowsById.set(row.id, row)
      return row
    },
    async search() {
      return []
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

describe('PlayerProfileService.ensureProfile', () => {
  let repository: PlayerProfileRepository

  beforeEach(() => {
    repository = createFakePlayerProfileRepository()
  })

  it('creates a profile with the supplied display name when none exists', async () => {
    const service = createPlayerProfileService(repository)

    const profile = await service.ensureProfile('user-1', 'Ada L.')

    expect(profile.display_name).toBe('Ada L.')
    expect(await service.getOwnProfile('user-1')).not.toBeNull()
  })

  it('trims the supplied display name', async () => {
    const service = createPlayerProfileService(repository)

    expect((await service.ensureProfile('user-1', '  Ada L.  ')).display_name).toBe('Ada L.')
  })

  it('never renames an existing profile, however it is re-entered', async () => {
    // The bug this guards: onboarding used to upsert, so re-entering the flow
    // (reachable from AccountSwitcher's rate-only redirect) silently replaced a
    // name the player had chosen.
    const service = createPlayerProfileService(repository)
    await service.saveOwnProfile('user-1', { display_name: 'Ada L.', city: 'Manila' })

    const again = await service.ensureProfile('user-1', 'someone-else')

    expect(again.display_name).toBe('Ada L.')
    expect(again.city).toBe('Manila')
  })

  it('returns the existing profile even when no display name is supplied', async () => {
    const service = createPlayerProfileService(repository)
    await service.saveOwnProfile('user-1', { display_name: 'Ada L.' })

    // The rate-only flow submits an assessment without a name; an existing
    // profile must satisfy the call rather than erroring.
    const again = await service.ensureProfile('user-1')

    expect(again.display_name).toBe('Ada L.')
  })

  it('refuses to create a profile without a display name rather than inventing one', async () => {
    const service = createPlayerProfileService(repository)

    await expect(service.ensureProfile('user-1')).rejects.toThrow(PlayerProfileValidationError)
    await expect(service.ensureProfile('user-1', '   ')).rejects.toThrow(
      PlayerProfileValidationError
    )
    await expect(service.ensureProfile('user-1', null)).rejects.toThrow(
      PlayerProfileValidationError
    )
  })

  it('does not create a profile when validation fails', async () => {
    const service = createPlayerProfileService(repository)

    await expect(service.ensureProfile('user-1')).rejects.toThrow()

    expect(await service.getOwnProfile('user-1')).toBeNull()
  })
})
