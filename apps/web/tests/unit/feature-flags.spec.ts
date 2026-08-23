/**
 * Platform feature flags: the catalog is data, so these cover what happens
 * around the data rather than what is in it.
 *
 * The cases that matter are all about a feature never appearing by accident: an
 * unseeded key, a table that does not exist yet, and a caller who is not the
 * SuperAdmin.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  isEnabledIn,
  toFeatureFlagDto,
  toFeatureFlagMap,
  type FeatureFlagRecord
} from '../../server/domains/platform/dto/feature-flag.dto'
import {
  createFeatureFlagService,
  FeatureFlagServiceError
} from '../../server/domains/platform/services/feature-flag.service'
import type { FeatureFlagRepository } from '../../server/domains/platform/repositories/feature-flag.repository'
import type { PlatformAdminService } from '../../server/domains/platform/services/platform-admin.service'

const SUPER_ADMIN = 'super-admin-user-id'

function makeFlag(overrides: Partial<FeatureFlagRecord> = {}): FeatureFlagRecord {
  return {
    id: 'flag-1',
    key: 'events.registered_badge',
    label: 'Registered badge on event cards',
    description: 'Marks the events a player has signed up for.',
    enabled: false,
    display_order: 1,
    updated_at: '2026-08-23T00:00:00Z',
    updated_by_user_id: null,
    ...overrides
  }
}

function serviceWith(
  records: FeatureFlagRecord[],
  { isSuperAdmin = true }: { isSuperAdmin?: boolean } = {}
) {
  const repository = {
    listAll: vi.fn().mockResolvedValue(records),
    findByKey: vi
      .fn()
      .mockImplementation(async (key: string) => records.find((r) => r.key === key) ?? null),
    setEnabled: vi
      .fn()
      .mockImplementation(async (key: string, enabled: boolean, userId: string) => ({
        ...makeFlag({ key }),
        enabled,
        updated_by_user_id: userId
      }))
  } as unknown as FeatureFlagRepository & {
    listAll: ReturnType<typeof vi.fn>
    findByKey: ReturnType<typeof vi.fn>
    setEnabled: ReturnType<typeof vi.fn>
  }

  const platformAdmin: PlatformAdminService = {
    isSuperAdmin: async () => isSuperAdmin
  }

  return { service: createFeatureFlagService(repository, platformAdmin), repository }
}

describe('feature flag map', () => {
  it('reads an unknown key as off', () => {
    // A gate whose row was never seeded must hide its feature, not reveal it.
    expect(isEnabledIn({}, 'events.registered_badge')).toBe(false)
    expect(isEnabledIn({ 'other.flag': true }, 'events.registered_badge')).toBe(false)
  })

  it('only treats a real true as on', () => {
    // Guards against a non-boolean sneaking through a JSON boundary: "false"
    // is truthy, and coercing here would enable something that is off.
    expect(isEnabledIn({ a: true }, 'a')).toBe(true)
    expect(isEnabledIn({ a: false }, 'a')).toBe(false)
    expect(isEnabledIn({ a: 'true' } as unknown as Record<string, boolean>, 'a')).toBe(false)
  })

  it('keys the map by flag key', () => {
    const map = toFeatureFlagMap([
      { key: 'a', enabled: true },
      { key: 'b', enabled: false }
    ])
    expect(map).toEqual({ a: true, b: false })
  })

  it('exposes no internals in the DTO', () => {
    // updated_by_user_id is a user id; the console has no use for it and the
    // public map is served from the same shape.
    const dto = toFeatureFlagDto(makeFlag({ updated_by_user_id: SUPER_ADMIN }))
    expect(dto).not.toHaveProperty('updated_by_user_id')
    expect(dto).not.toHaveProperty('id')
  })
})

describe('feature flag service', () => {
  it('treats a missing catalog as everything off', async () => {
    // The repository returns [] when the 023 migration has not run. Nothing
    // gated may appear in that state.
    const { service } = serviceWith([])

    expect(await service.getFlagMap()).toEqual({})
    expect(isEnabledIn(await service.getFlagMap(), 'events.registered_badge')).toBe(false)
  })

  it('serves the catalog as stored', async () => {
    const { service } = serviceWith([makeFlag({ enabled: true })])

    const flags = await service.listFlags()

    expect(flags).toHaveLength(1)
    expect(flags[0]!.key).toBe('events.registered_badge')
    expect(flags[0]!.enabled).toBe(true)
  })

  it('lets the super admin flip a flag', async () => {
    const { service, repository } = serviceWith([makeFlag()])

    const updated = await service.setFlag(SUPER_ADMIN, 'events.registered_badge', true)

    expect(updated.enabled).toBe(true)
    expect(repository.setEnabled).toHaveBeenCalledWith('events.registered_badge', true, SUPER_ADMIN)
  })

  it('refuses anyone who is not the super admin', async () => {
    const { service, repository } = serviceWith([makeFlag()], { isSuperAdmin: false })

    await expect(
      service.setFlag('someone-else', 'events.registered_badge', true)
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    expect(repository.setEnabled).not.toHaveBeenCalled()
  })

  it('checks the caller before looking the key up', async () => {
    // Otherwise the error tells a stranger which flags exist.
    const { service, repository } = serviceWith([makeFlag()], { isSuperAdmin: false })

    await expect(service.setFlag('someone-else', 'made.up', true)).rejects.toMatchObject({
      status: 403
    })
    expect(repository.findByKey).not.toHaveBeenCalled()
  })

  it('404s a key with no row', async () => {
    const { service, repository } = serviceWith([makeFlag()])

    await expect(service.setFlag(SUPER_ADMIN, 'made.up', true)).rejects.toBeInstanceOf(
      FeatureFlagServiceError
    )
    expect(repository.setEnabled).not.toHaveBeenCalled()
  })
})
