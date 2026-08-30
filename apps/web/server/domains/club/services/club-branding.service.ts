import type { BrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import type { ClubRepository } from '../repositories/club.repository'
import type { ClubMembershipRepository } from '../repositories/club-membership.repository'
import { extensionFor, MAX_UPLOAD_BYTES } from '~/server/domains/platform/dto/branding.dto'
import type { ClubDto } from '../dto/club.dto'
import { toClubDto } from '../dto/club.dto'

export class ClubBrandingServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

/** Which image is being replaced. Names the storage path, so it is closed. */
export type ClubImageSlot = 'cover' | 'logo'

export function isClubImageSlot(value: unknown): value is ClubImageSlot {
  return value === 'cover' || value === 'logo'
}

const SLOT_COLUMNS: Record<ClubImageSlot, 'cover_photo_path' | 'logo_path'> = {
  cover: 'cover_photo_path',
  logo: 'logo_path'
}

export interface UploadedClubImage {
  contentType: string
  bytes: Buffer
}

export interface ClubBrandingService {
  uploadImage(
    actingPlayerId: string,
    clubId: string,
    slot: ClubImageSlot,
    image: UploadedClubImage
  ): Promise<ClubDto>
  clearImage(actingPlayerId: string, clubId: string, slot: ClubImageSlot): Promise<ClubDto>
  /** Turns the stored paths into URLs a browser can load. */
  withImageUrls(
    club: ClubDto,
    paths: { cover: string | null; logo: string | null }
  ): Promise<ClubDto>
}

const ADMIN_ROLES = ['OWNER', 'ADMIN']

/**
 * Club cover photos and logos.
 *
 * Deliberately reuses the platform's BrandingAssetRepository - the same bucket,
 * the same public-vs-signed URL logic, the same upload call - rather than
 * growing a second, subtly different storage path. The bucket has no anon write
 * access, so uploads go through the server either way; a club-specific
 * repository would only duplicate the signing rules and let them drift.
 *
 * The timestamp in the object path is what makes a replacement visible: Storage
 * upserts in place, and a CDN holding the old bytes under the same key would
 * keep serving the previous photo for the full cache lifetime.
 */
export function createClubBrandingService(
  clubs: ClubRepository,
  memberships: ClubMembershipRepository,
  assets: BrandingAssetRepository
): ClubBrandingService {
  async function assertClubAdmin(actingPlayerId: string, clubId: string) {
    const membership = await memberships.findByClubAndPlayer(clubId, actingPlayerId)
    if (!membership || membership.status !== 'active' || !ADMIN_ROLES.includes(membership.role)) {
      throw new ClubBrandingServiceError(
        403,
        'FORBIDDEN',
        'Only the club owner or an admin can change club images.'
      )
    }
  }

  return {
    async uploadImage(actingPlayerId, clubId, slot, image) {
      await assertClubAdmin(actingPlayerId, clubId)

      const extension = extensionFor(image.contentType)
      if (!extension) {
        throw new ClubBrandingServiceError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'Upload a PNG or JPEG image.'
        )
      }
      if (!image.bytes.length) {
        throw new ClubBrandingServiceError(400, 'VALIDATION_ERROR', 'The uploaded file was empty.')
      }
      if (image.bytes.length > MAX_UPLOAD_BYTES) {
        throw new ClubBrandingServiceError(
          413,
          'FILE_TOO_LARGE',
          'Images must be 50 MB or smaller.'
        )
      }

      const existing = await clubs.findById(clubId)
      if (!existing) {
        throw new ClubBrandingServiceError(404, 'NOT_FOUND', 'Club not found.')
      }

      const column = SLOT_COLUMNS[slot]
      const previousPath = existing[column]
      const path = `clubs/${clubId}/${slot}-${Date.now()}.${extension}`

      await assets.upload(path, image.bytes, image.contentType)
      const updated = await clubs.update(clubId, { [column]: path })

      // Only after the row points at the new object: a failed update would
      // otherwise leave the club referencing something that no longer exists.
      if (previousPath && previousPath !== path) {
        await assets.remove(previousPath)
      }

      return toClubDto(updated)
    },

    async clearImage(actingPlayerId, clubId, slot) {
      await assertClubAdmin(actingPlayerId, clubId)

      const existing = await clubs.findById(clubId)
      if (!existing) {
        throw new ClubBrandingServiceError(404, 'NOT_FOUND', 'Club not found.')
      }

      const column = SLOT_COLUMNS[slot]
      const previousPath = existing[column]

      const updated = await clubs.update(clubId, { [column]: null })
      if (previousPath) await assets.remove(previousPath)

      // Back to UiCoverArt, which generates a banner from the club name and is
      // a complete design rather than a placeholder.
      return toClubDto(updated)
    },

    async withImageUrls(club, paths) {
      const [cover, logo] = await Promise.all([
        paths.cover ? assets.resolveUrl(paths.cover) : Promise.resolve(null),
        paths.logo ? assets.resolveUrl(paths.logo) : Promise.resolve(null)
      ])
      return { ...club, cover_photo_url: cover, logo_url: logo }
    }
  }
}
