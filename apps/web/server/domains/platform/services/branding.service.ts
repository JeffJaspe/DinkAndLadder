import type { BrandingAssetRepository } from '../repositories/branding-asset.repository'
import type { BrandingRepository, HeroPatch } from '../repositories/branding.repository'
import type { PlatformAdminService } from './platform-admin.service'
import {
  appNameOf,
  backgroundOpacityOf,
  extensionFor,
  focalXOf,
  focalYOf,
  isHexColor,
  objectPathFor,
  overlayColorOf,
  overlayOpacityOf,
  MAX_APP_NAME_LENGTH,
  MAX_HERO_SUBTITLE_LENGTH,
  MAX_HERO_TITLE_LENGTH,
  MAX_UPLOAD_BYTES,
  type BrandingAdminDto,
  type BrandingDto,
  type BrandingRecord,
  type BrandingSlot
} from '../dto/branding.dto'

export class BrandingServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface UploadedAsset {
  filename: string
  contentType: string
  bytes: Buffer
}

export interface HeroInput {
  title?: string
  subtitle?: string
  overlay_color?: string
  overlay_opacity?: number
  background_opacity?: number
  focal_x?: number
  focal_y?: number
}

export interface BrandingService {
  /** What a page needs: name, loadable URLs, hero copy. */
  getBranding(): Promise<BrandingDto>
  /** The console's view: the same, plus the raw paths. */
  getBrandingForAdmin(): Promise<BrandingAdminDto>
  /** SuperAdmin only. An empty name resets to the platform's own. */
  setAppName(userId: string, appName: string): Promise<BrandingAdminDto>
  /** SuperAdmin only. Empty strings reset a field to the built-in copy. */
  setHero(userId: string, input: HeroInput): Promise<BrandingAdminDto>
  /** SuperAdmin only. Replaces whatever occupies the slot. */
  uploadAsset(userId: string, slot: BrandingSlot, asset: UploadedAsset): Promise<BrandingAdminDto>
  /** SuperAdmin only. Clears the slot back to the built-in mark. */
  clearAsset(userId: string, slot: BrandingSlot): Promise<BrandingAdminDto>
}

/**
 * Both hero opacities reach a public page as an inline style and are guarded by
 * a CHECK constraint besides, so a value outside 0..1 is refused here rather
 * than clamped — a rejected save tells the operator something went wrong, where
 * a silent clamp would look like the slider ignored them.
 */
function assertOpacity(value: unknown, label: string): number {
  return assertFraction(value, label)
}

/** The focal point shares the opacities' 0..1 range and the same refusal. */
function assertFraction(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new BrandingServiceError(400, 'VALIDATION_ERROR', `The ${label} must be between 0 and 1.`)
  }
  return value
}

const SLOT_PATHS: Record<BrandingSlot, keyof BrandingRecord> = {
  logo: 'logo_path',
  favicon: 'favicon_path',
  hero: 'hero_background_path'
}

export function createBrandingService(
  branding: BrandingRepository,
  assets: BrandingAssetRepository,
  platformAdmin: PlatformAdminService
): BrandingService {
  async function toDto(record: BrandingRecord): Promise<BrandingDto> {
    const [logo, favicon, hero] = await Promise.all([
      record.logo_path ? assets.resolveUrl(record.logo_path) : Promise.resolve(null),
      record.favicon_path ? assets.resolveUrl(record.favicon_path) : Promise.resolve(null),
      record.hero_background_path
        ? assets.resolveUrl(record.hero_background_path)
        : Promise.resolve(null)
    ])

    return {
      app_name: appNameOf(record),
      logo_url: logo,
      favicon_url: favicon,
      hero: {
        // Empty strings are stored as NULL, so a blank here really is "unset"
        // and the landing page keeps its own copy.
        title: record.hero_title?.trim() || null,
        subtitle: record.hero_subtitle?.trim() || null,
        background_url: hero,
        overlay_color: overlayColorOf(record),
        overlay_opacity: overlayOpacityOf(record),
        background_opacity: backgroundOpacityOf(record),
        focal_x: focalXOf(record),
        focal_y: focalYOf(record)
      }
    }
  }

  async function toAdminDto(record: BrandingRecord): Promise<BrandingAdminDto> {
    return {
      ...(await toDto(record)),
      logo_path: record.logo_path,
      favicon_path: record.favicon_path,
      hero_background_path: record.hero_background_path,
      updated_at: record.branding_updated_at
    }
  }

  async function assertSuperAdmin(userId: string) {
    if (!(await platformAdmin.isSuperAdmin(userId))) {
      throw new BrandingServiceError(
        403,
        'FORBIDDEN',
        'Only the platform SuperAdmin can change branding.'
      )
    }
  }

  return {
    async getBranding() {
      return toDto(await branding.get())
    },

    async getBrandingForAdmin() {
      return toAdminDto(await branding.get())
    },

    async setAppName(userId, appName) {
      await assertSuperAdmin(userId)

      const trimmed = appName.trim()
      if (trimmed.length > MAX_APP_NAME_LENGTH) {
        // The name sits in the sidebar, the mobile header and every page title.
        throw new BrandingServiceError(
          400,
          'VALIDATION_ERROR',
          `The platform name must be ${MAX_APP_NAME_LENGTH} characters or fewer.`
        )
      }

      // Empty means "go back to the platform's own name", stored as NULL so it
      // stays distinguishable from someone typing the default in by hand.
      return toAdminDto(await branding.setAppName(trimmed || null, userId))
    },

    async setHero(userId, input) {
      await assertSuperAdmin(userId)

      const patch: HeroPatch = {}

      if (input.title !== undefined) {
        const title = input.title.trim()
        if (title.length > MAX_HERO_TITLE_LENGTH) {
          throw new BrandingServiceError(
            400,
            'VALIDATION_ERROR',
            `The headline must be ${MAX_HERO_TITLE_LENGTH} characters or fewer.`
          )
        }
        patch.hero_title = title || null
      }

      if (input.subtitle !== undefined) {
        const subtitle = input.subtitle.trim()
        if (subtitle.length > MAX_HERO_SUBTITLE_LENGTH) {
          throw new BrandingServiceError(
            400,
            'VALIDATION_ERROR',
            `The subheading must be ${MAX_HERO_SUBTITLE_LENGTH} characters or fewer.`
          )
        }
        patch.hero_subtitle = subtitle || null
      }

      if (input.overlay_color !== undefined) {
        // Interpolated into an inline style on a public page, so anything that
        // is not a plain hex colour is refused rather than sanitised through.
        if (input.overlay_color !== '' && !isHexColor(input.overlay_color)) {
          throw new BrandingServiceError(
            400,
            'VALIDATION_ERROR',
            'The overlay colour must be a hex value like #000000.'
          )
        }
        patch.hero_overlay_color = input.overlay_color || null
      }

      if (input.overlay_opacity !== undefined) {
        patch.hero_overlay_opacity = assertOpacity(input.overlay_opacity, 'overlay opacity')
      }

      if (input.background_opacity !== undefined) {
        patch.hero_background_opacity = assertOpacity(
          input.background_opacity,
          'background image opacity'
        )
      }

      if (input.focal_x !== undefined) {
        patch.hero_focal_x = assertFraction(input.focal_x, 'focal point')
      }

      if (input.focal_y !== undefined) {
        patch.hero_focal_y = assertFraction(input.focal_y, 'focal point')
      }

      if (!Object.keys(patch).length) {
        throw new BrandingServiceError(400, 'VALIDATION_ERROR', 'Nothing to update.')
      }

      return toAdminDto(await branding.setHero(patch, userId))
    },

    async uploadAsset(userId, slot, asset) {
      await assertSuperAdmin(userId)

      const extension = extensionFor(asset.contentType)
      if (!extension) {
        throw new BrandingServiceError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a PNG or JPEG image.')
      }
      if (!asset.bytes.length) {
        throw new BrandingServiceError(400, 'VALIDATION_ERROR', 'The uploaded file was empty.')
      }
      if (asset.bytes.length > MAX_UPLOAD_BYTES) {
        throw new BrandingServiceError(413, 'FILE_TOO_LARGE', 'Images must be 50 MB or smaller.')
      }

      const previous = await branding.get()
      const path = objectPathFor(slot, extension, Date.now())

      await assets.upload(path, asset.bytes, asset.contentType)
      const updated = await branding.setAssetPath(slot, path, userId)

      // Only after the row points at the new object — a failed update would
      // otherwise leave the config referencing something already deleted.
      const previousPath = previous[SLOT_PATHS[slot]] as string | null
      if (previousPath && previousPath !== path) {
        await assets.remove(previousPath)
      }

      return toAdminDto(updated)
    },

    async clearAsset(userId, slot) {
      await assertSuperAdmin(userId)

      const current = await branding.get()
      const updated = await branding.setAssetPath(slot, null, userId)

      const path = current[SLOT_PATHS[slot]] as string | null
      if (path) await assets.remove(path)

      return toAdminDto(updated)
    }
  }
}
