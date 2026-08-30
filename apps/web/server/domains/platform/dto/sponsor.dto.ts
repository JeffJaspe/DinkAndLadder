/**
 * Landing-page sponsors (database/liquibase/042-sponsors).
 *
 * Follows 025-platform-branding: the row stores a bucket-relative PATH, the DTO
 * carries a resolved URL, and the two are deliberately different fields. The URL
 * shape depends on whether the bucket is public — a deployment decision — and a
 * signed URL has a lifetime, so baking one into the row would eventually serve a
 * dead link.
 */

export interface SponsorRecord {
  id: string
  label: string
  image_path: string | null
  link_url: string | null
  display_order: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface SponsorDto {
  id: string
  label: string
  /** Resolved per request from `image_path`; null when there is no image. */
  image_url: string | null
  link_url: string | null
  display_order: number
  enabled: boolean
}

export function toSponsorDto(record: SponsorRecord, imageUrl: string | null): SponsorDto {
  return {
    id: record.id,
    label: record.label,
    image_url: imageUrl,
    link_url: record.link_url,
    display_order: record.display_order,
    enabled: record.enabled
  }
}

export interface SponsorInput {
  label: string
  link_url?: string | null
  display_order?: number
  enabled?: boolean
}

export const MAX_LABEL_LENGTH = 80

/**
 * Only http(s), and only an absolute URL.
 *
 * A sponsor link is operator-supplied and rendered on the public landing page,
 * so a `javascript:` or `data:` href would be stored XSS with an audience. A
 * relative URL is rejected too: it would silently point back into the platform,
 * which is never what a sponsor link means.
 */
export function isSafeSponsorLink(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
