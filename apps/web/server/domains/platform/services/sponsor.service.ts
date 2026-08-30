import type { SponsorRepository } from '../repositories/sponsor.repository'
import type { BrandingAssetRepository } from '../repositories/branding-asset.repository'
import type { PlatformAdminService } from './platform-admin.service'
import {
  isSafeSponsorLink,
  MAX_LABEL_LENGTH,
  toSponsorDto,
  type SponsorDto,
  type SponsorInput,
  type SponsorRecord
} from '../dto/sponsor.dto'
import { extensionFor, MAX_UPLOAD_BYTES } from '../dto/branding.dto'

export class SponsorServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface SponsorService {
  /** Public: what the landing page renders. */
  listPublic(): Promise<SponsorDto[]>
  /** SuperAdmin: everything, including disabled rows. */
  listForAdmin(userId: string): Promise<SponsorDto[]>
  create(userId: string, input: SponsorInput): Promise<SponsorDto>
  update(userId: string, id: string, input: Partial<SponsorInput>): Promise<SponsorDto>
  uploadImage(
    userId: string,
    id: string,
    asset: { contentType: string; bytes: Buffer }
  ): Promise<SponsorDto>
  remove(userId: string, id: string): Promise<void>
}

export function createSponsorService(
  sponsors: SponsorRepository,
  assets: BrandingAssetRepository,
  platformAdmin: PlatformAdminService
): SponsorService {
  async function assertSuperAdmin(userId: string) {
    if (!(await platformAdmin.isSuperAdmin(userId))) {
      throw new SponsorServiceError(
        403,
        'FORBIDDEN',
        'Only the platform SuperAdmin can manage sponsors.'
      )
    }
  }

  /** Resolves every image in one pass rather than one round trip per sponsor. */
  async function toDtos(records: SponsorRecord[]): Promise<SponsorDto[]> {
    const urls = await Promise.all(
      records.map((r) => (r.image_path ? assets.resolveUrl(r.image_path) : Promise.resolve(null)))
    )
    return records.map((record, i) => toSponsorDto(record, urls[i]))
  }

  function validate(input: Partial<SponsorInput>) {
    if (input.label !== undefined) {
      const label = input.label.trim()
      if (!label) {
        throw new SponsorServiceError(400, 'VALIDATION_ERROR', 'A sponsor needs a name.')
      }
      if (label.length > MAX_LABEL_LENGTH) {
        throw new SponsorServiceError(
          400,
          'VALIDATION_ERROR',
          `Keep the name under ${MAX_LABEL_LENGTH} characters.`
        )
      }
    }

    // Rendered as an href on the public landing page, so anything other than
    // http(s) is stored XSS with an audience.
    if (input.link_url) {
      if (!isSafeSponsorLink(input.link_url)) {
        throw new SponsorServiceError(
          400,
          'VALIDATION_ERROR',
          'The link must be a full http:// or https:// address.'
        )
      }
    }
  }

  return {
    async listPublic() {
      return toDtos(await sponsors.listEnabled())
    },

    async listForAdmin(userId) {
      await assertSuperAdmin(userId)
      return toDtos(await sponsors.listAll())
    },

    async create(userId, input) {
      await assertSuperAdmin(userId)
      validate(input)

      const created = await sponsors.create({
        ...input,
        label: input.label.trim(),
        link_url: input.link_url?.trim() || null
      })
      return toSponsorDto(created, null)
    },

    async update(userId, id, input) {
      await assertSuperAdmin(userId)
      validate(input)

      const existing = await sponsors.findById(id)
      if (!existing) {
        throw new SponsorServiceError(404, 'NOT_FOUND', 'No such sponsor.')
      }

      const updated = await sponsors.update(id, {
        ...input,
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.link_url !== undefined ? { link_url: input.link_url?.trim() || null } : {})
      })

      return toSponsorDto(
        updated,
        updated.image_path ? await assets.resolveUrl(updated.image_path) : null
      )
    },

    async uploadImage(userId, id, asset) {
      await assertSuperAdmin(userId)

      const extension = extensionFor(asset.contentType)
      if (!extension) {
        throw new SponsorServiceError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a PNG or JPEG image.')
      }
      if (!asset.bytes.length) {
        throw new SponsorServiceError(400, 'VALIDATION_ERROR', 'The uploaded file was empty.')
      }
      if (asset.bytes.length > MAX_UPLOAD_BYTES) {
        throw new SponsorServiceError(413, 'FILE_TOO_LARGE', 'Images must be 50 MB or smaller.')
      }

      const existing = await sponsors.findById(id)
      if (!existing) {
        throw new SponsorServiceError(404, 'NOT_FOUND', 'No such sponsor.')
      }

      // Timestamped so a replacement is actually seen: Storage upserts in place,
      // and a CDN holding the old bytes under the same key would keep serving
      // the previous logo for its whole cache lifetime.
      const path = `sponsors/${id}-${Date.now()}.${extension}`
      await assets.upload(path, asset.bytes, asset.contentType)
      const updated = await sponsors.update(id, { image_path: path })

      // Only after the row points at the new object.
      if (existing.image_path && existing.image_path !== path) {
        await assets.remove(existing.image_path)
      }

      return toSponsorDto(updated, await assets.resolveUrl(path))
    },

    async remove(userId, id) {
      await assertSuperAdmin(userId)

      const existing = await sponsors.findById(id)
      if (!existing) return // already gone is the desired end state

      await sponsors.remove(id)
      if (existing.image_path) await assets.remove(existing.image_path)
    }
  }
}
