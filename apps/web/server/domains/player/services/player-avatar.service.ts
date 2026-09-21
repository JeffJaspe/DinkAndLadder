import type { BrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { extensionFor, MAX_UPLOAD_BYTES } from '~/server/domains/platform/dto/branding.dto'
import type { PlayerProfileRepository } from '../repositories/player-profile.repository'
import type { PlayerProfileDto } from '../dto/player-profile.dto'
import { toPlayerProfileDto } from '../dto/player-profile.dto'

export class PlayerAvatarServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'PlayerAvatarServiceError'
  }
}

export interface UploadedAvatar {
  contentType: string
  bytes: Buffer
}

export interface PlayerAvatarService {
  /** Replaces the signed-in player's photo and returns their profile. */
  upload(userId: string, image: UploadedAvatar): Promise<PlayerProfileDto>
  /** Removes the photo; the profile falls back to the initials avatar. */
  clear(userId: string): Promise<PlayerProfileDto>
  /** Fills `avatar_url` on a DTO from its stored path. */
  withAvatarUrl(profile: PlayerProfileDto, avatarPath: string | null): Promise<PlayerProfileDto>
  /**
   * Batch form for lists. One entry per id that actually has a path — a
   * signed URL costs a round trip each, so a page of forty players must not
   * ask for forty of them serially.
   */
  resolveUrls(paths: Map<string, string | null>): Promise<Map<string, string | null>>
  /**
   * Import an avatar from an external URL (e.g. Google OAuth profile picture).
   * Downloads the image and stores it in our bucket. Returns null if the URL is
   * invalid or the download fails — a missing OAuth avatar should never block
   * profile creation.
   */
  importFromUrl(profileId: string, externalUrl: string): Promise<string | null>
}

/**
 * Player profile photos.
 *
 * Deliberately reuses the platform's BrandingAssetRepository, exactly as
 * ClubBrandingService does: the same bucket, the same public-vs-signed URL
 * logic, the same upload call. A player-specific repository would only
 * duplicate the signing rules and let them drift.
 *
 * The timestamp in the object path is what makes a replacement visible.
 * Storage upserts in place, and a CDN holding the old bytes under the same key
 * would keep serving the previous photo for the full cache lifetime.
 *
 * The identity is always the *session's* user id resolved to a profile here —
 * never a profile id from the request — so this service cannot be pointed at
 * somebody else's row.
 */
export function createPlayerAvatarService(
  profiles: PlayerProfileRepository,
  assets: BrandingAssetRepository
): PlayerAvatarService {
  async function requireProfile(userId: string) {
    const profile = await profiles.findByUserId(userId)
    if (!profile) {
      throw new PlayerAvatarServiceError(
        404,
        'NOT_FOUND',
        'Save your profile first, then add a photo.'
      )
    }
    return profile
  }

  return {
    async upload(userId, image) {
      const extension = extensionFor(image.contentType)
      if (!extension) {
        throw new PlayerAvatarServiceError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'Upload a PNG or JPEG image.'
        )
      }
      if (!image.bytes.length) {
        throw new PlayerAvatarServiceError(400, 'VALIDATION_ERROR', 'The uploaded file was empty.')
      }
      if (image.bytes.length > MAX_UPLOAD_BYTES) {
        throw new PlayerAvatarServiceError(413, 'FILE_TOO_LARGE', 'Photos must be 50 MB or smaller.')
      }

      const existing = await requireProfile(userId)
      const previousPath = existing.avatar_path
      const path = `players/${existing.id}/avatar-${Date.now()}.${extension}`

      await assets.upload(path, image.bytes, image.contentType)
      const updated = await profiles.updateAvatarPath(existing.id, path)

      // Only after the row points at the new object: a failed update would
      // otherwise leave the profile referencing something that no longer exists.
      if (previousPath && previousPath !== path) {
        await assets.remove(previousPath)
      }

      const url = await assets.resolveUrl(path)
      return { ...toPlayerProfileDto(updated), avatar_url: url }
    },

    async clear(userId) {
      const existing = await requireProfile(userId)
      const previousPath = existing.avatar_path

      const updated = await profiles.updateAvatarPath(existing.id, null)
      if (previousPath) await assets.remove(previousPath)

      return toPlayerProfileDto(updated)
    },

    async withAvatarUrl(profile, avatarPath) {
      if (!avatarPath) return profile
      return { ...profile, avatar_url: await assets.resolveUrl(avatarPath) }
    },

    async resolveUrls(paths) {
      const entries = [...paths.entries()].filter(([, path]) => Boolean(path))
      const resolved = await Promise.all(
        entries.map(async ([id, path]) => [id, await assets.resolveUrl(path!)] as const)
      )
      return new Map(resolved)
    },

    async importFromUrl(profileId, externalUrl) {
      try {
        const response = await fetch(externalUrl, {
          headers: { Accept: 'image/png, image/jpeg, image/webp, image/*' }
        })
        if (!response.ok) return null

        const contentType = response.headers.get('content-type') || 'image/jpeg'
        const extension = extensionFor(contentType) || 'jpg'
        const bytes = Buffer.from(await response.arrayBuffer())

        if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) return null

        const path = `players/${profileId}/avatar-${Date.now()}.${extension}`
        await assets.upload(path, bytes, contentType.split(';')[0])
        await profiles.updateAvatarPath(profileId, path)
        return path
      } catch {
        // Network errors, timeouts, invalid URLs — silently fall back to initials.
        return null
      }
    }
  }
}
