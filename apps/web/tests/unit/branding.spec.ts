/**
 * Platform branding.
 *
 * The interesting cases are the ones where a bad upload or a half-finished
 * change could leave the platform pointing at an object that is not there:
 * a rejected file type, a failed row update, and clearing a slot.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  appNameOf,
  extensionFor,
  isBrandingSlot,
  objectPathFor,
  DEFAULT_APP_NAME,
  MAX_UPLOAD_BYTES,
  type BrandingRecord
} from '../../server/domains/platform/dto/branding.dto'
import {
  createBrandingService,
  BrandingServiceError
} from '../../server/domains/platform/services/branding.service'
import type { BrandingRepository } from '../../server/domains/platform/repositories/branding.repository'
import type { BrandingAssetRepository } from '../../server/domains/platform/repositories/branding-asset.repository'
import type { PlatformAdminService } from '../../server/domains/platform/services/platform-admin.service'

const SUPER_ADMIN = 'super-admin-user-id'

function makeRecord(overrides: Partial<BrandingRecord> = {}): BrandingRecord {
  return {
    app_name: null,
    logo_path: null,
    favicon_path: null,
    hero_title: null,
    hero_subtitle: null,
    hero_background_path: null,
    hero_overlay_color: null,
    hero_overlay_opacity: null,
    branding_updated_at: null,
    ...overrides
  }
}

function serviceWith(record: BrandingRecord, { isSuperAdmin = true } = {}) {
  let stored = record

  const branding = {
    get: vi.fn().mockImplementation(async () => stored),
    setAppName: vi.fn().mockImplementation(async (app_name: string | null) => {
      stored = { ...stored, app_name }
      return stored
    }),
    setAssetPath: vi.fn().mockImplementation(async (slot: string, path: string | null) => {
      stored = { ...stored, [slot === 'logo' ? 'logo_path' : 'favicon_path']: path }
      return stored
    })
  } as unknown as BrandingRepository & {
    get: ReturnType<typeof vi.fn>
    setAppName: ReturnType<typeof vi.fn>
    setAssetPath: ReturnType<typeof vi.fn>
  }

  const assets = {
    upload: vi.fn().mockImplementation(async (path: string) => path),
    remove: vi.fn().mockResolvedValue(undefined),
    resolveUrl: vi.fn().mockImplementation(async (path: string) => `https://signed.test/${path}`)
  } as unknown as BrandingAssetRepository & {
    upload: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    resolveUrl: ReturnType<typeof vi.fn>
  }

  const platformAdmin: PlatformAdminService = { isSuperAdmin: async () => isSuperAdmin }

  return { service: createBrandingService(branding, assets, platformAdmin), branding, assets }
}

const PNG = {
  filename: 'logo.png',
  contentType: 'image/png',
  bytes: Buffer.from('not-really-a-png')
}

describe('branding values', () => {
  it('falls back to the platform name when none is set', () => {
    // NULL means "nobody renamed it", and a name of spaces is not a name.
    expect(appNameOf(null)).toBe(DEFAULT_APP_NAME)
    expect(appNameOf({ app_name: null })).toBe(DEFAULT_APP_NAME)
    expect(appNameOf({ app_name: '   ' })).toBe(DEFAULT_APP_NAME)
    expect(appNameOf({ app_name: 'Pickle PH' })).toBe('Pickle PH')
  })

  it('accepts only the raster types the bucket allows', () => {
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('IMAGE/PNG')).toBe('png')
    // SVG is deliberately out: the bucket's allow-list names `image/svg`, which
    // no browser sends, and a same-origin SVG can carry script.
    expect(extensionFor('image/svg+xml')).toBeNull()
    expect(extensionFor('application/pdf')).toBeNull()
  })

  it('names objects per slot with a cache-busting stamp', () => {
    // A replaced logo occupies the same slot; without the stamp a public URL
    // would keep serving the previous image from cache.
    expect(objectPathFor('logo', 'png', 1700000000000)).toBe('platform/logo-1700000000000.png')
    expect(objectPathFor('favicon', 'jpg', 1)).toBe('platform/favicon-1.jpg')
  })

  it('recognises only the defined slots', () => {
    // The slot becomes part of the storage path, so an open set would let a
    // caller write anywhere in the bucket.
    expect(isBrandingSlot('logo')).toBe(true)
    expect(isBrandingSlot('favicon')).toBe(true)
    expect(isBrandingSlot('../../secrets')).toBe(false)
    expect(isBrandingSlot(7)).toBe(false)
  })
})

describe('branding service', () => {
  it('resolves stored paths into loadable URLs', async () => {
    const { service } = serviceWith(
      makeRecord({ app_name: 'Pickle PH', logo_path: 'platform/logo-1.png' })
    )

    const dto = await service.getBranding()

    expect(dto.app_name).toBe('Pickle PH')
    expect(dto.logo_url).toBe('https://signed.test/platform/logo-1.png')
    expect(dto.favicon_url).toBeNull()
  })

  it('stores an empty name as null', async () => {
    // So "reset to the built-in name" stays distinguishable from someone typing
    // the default in by hand.
    const { service, branding } = serviceWith(makeRecord({ app_name: 'Pickle PH' }))

    const dto = await service.setAppName(SUPER_ADMIN, '   ')

    expect(branding.setAppName).toHaveBeenCalledWith(null, SUPER_ADMIN)
    expect(dto.app_name).toBe(DEFAULT_APP_NAME)
  })

  it('refuses a name longer than the header can carry', async () => {
    const { service } = serviceWith(makeRecord())

    await expect(service.setAppName(SUPER_ADMIN, 'x'.repeat(61))).rejects.toMatchObject({
      status: 400
    })
  })

  it('uploads, then points the row at the new object, then deletes the old one', async () => {
    // Order matters: deleting first would leave the config referencing an
    // object that no longer exists if the update failed.
    const { service, branding, assets } = serviceWith(
      makeRecord({ logo_path: 'platform/logo-old.png' })
    )

    await service.uploadAsset(SUPER_ADMIN, 'logo', PNG)

    expect(assets.upload).toHaveBeenCalled()
    expect(branding.setAssetPath).toHaveBeenCalled()
    expect(assets.remove).toHaveBeenCalledWith('platform/logo-old.png')
    expect(assets.upload.mock.invocationCallOrder[0]).toBeLessThan(
      branding.setAssetPath.mock.invocationCallOrder[0]
    )
    expect(branding.setAssetPath.mock.invocationCallOrder[0]).toBeLessThan(
      assets.remove.mock.invocationCallOrder[0]
    )
  })

  it('rejects a type the bucket will not take, before writing anything', async () => {
    const { service, assets, branding } = serviceWith(makeRecord())

    await expect(
      service.uploadAsset(SUPER_ADMIN, 'logo', { ...PNG, contentType: 'image/gif' })
    ).rejects.toMatchObject({ status: 415 })
    expect(assets.upload).not.toHaveBeenCalled()
    expect(branding.setAssetPath).not.toHaveBeenCalled()
  })

  it('rejects an empty file and one over the bucket ceiling', async () => {
    const { service } = serviceWith(makeRecord())

    await expect(
      service.uploadAsset(SUPER_ADMIN, 'logo', { ...PNG, bytes: Buffer.alloc(0) })
    ).rejects.toMatchObject({ status: 400 })

    await expect(
      service.uploadAsset(SUPER_ADMIN, 'logo', {
        ...PNG,
        bytes: Buffer.alloc(MAX_UPLOAD_BYTES + 1)
      })
    ).rejects.toMatchObject({ status: 413 })
  })

  it('clears a slot and removes the object behind it', async () => {
    const { service, assets } = serviceWith(makeRecord({ favicon_path: 'platform/favicon-1.png' }))

    const dto = await service.clearAsset(SUPER_ADMIN, 'favicon')

    expect(dto.favicon_url).toBeNull()
    expect(assets.remove).toHaveBeenCalledWith('platform/favicon-1.png')
  })

  it('refuses every write from anyone who is not the super admin', async () => {
    const { service, assets, branding } = serviceWith(makeRecord(), { isSuperAdmin: false })

    await expect(service.setAppName('someone', 'Nope')).rejects.toBeInstanceOf(BrandingServiceError)
    await expect(service.uploadAsset('someone', 'logo', PNG)).rejects.toMatchObject({ status: 403 })
    await expect(service.clearAsset('someone', 'logo')).rejects.toMatchObject({ status: 403 })

    expect(branding.setAppName).not.toHaveBeenCalled()
    expect(assets.upload).not.toHaveBeenCalled()
    expect(assets.remove).not.toHaveBeenCalled()
  })

  it('lets anyone read branding', async () => {
    // The header renders for signed-out visitors too.
    const { service } = serviceWith(makeRecord({ app_name: 'Pickle PH' }), { isSuperAdmin: false })

    expect((await service.getBranding()).app_name).toBe('Pickle PH')
  })
})
