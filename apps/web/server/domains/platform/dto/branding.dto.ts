/**
 * Platform branding and landing hero
 * (docs/30-SUPER-ADMIN-SPECIFICATION.md §2.1 and §2.3).
 *
 * Stored as text plus bucket-relative object paths; the URLs a browser can
 * actually load are minted at read time, because whether they are public or
 * signed depends on the bucket's setting rather than on the row.
 */

/** The platform's own name, used whenever nothing has been set. */
export const DEFAULT_APP_NAME = 'DinkAndLadder'

/** The scrim under hero text when the operator sets an image but no overlay. */
export const DEFAULT_OVERLAY_COLOR = '#000000'
export const DEFAULT_OVERLAY_OPACITY = 0.5

export interface BrandingRecord {
  app_name: string | null
  logo_path: string | null
  favicon_path: string | null
  hero_title: string | null
  hero_subtitle: string | null
  hero_background_path: string | null
  hero_overlay_color: string | null
  hero_overlay_opacity: number | string | null
  branding_updated_at: string | null
}

export interface HeroDto {
  /** null means the landing page keeps its built-in copy. */
  title: string | null
  subtitle: string | null
  background_url: string | null
  overlay_color: string
  overlay_opacity: number
}

/** What a page needs to paint the brand. */
export interface BrandingDto {
  app_name: string
  logo_url: string | null
  favicon_url: string | null
  hero: HeroDto
}

/** The console's view: paths as stored, so it can tell "unset" from "resolved". */
export interface BrandingAdminDto extends BrandingDto {
  logo_path: string | null
  favicon_path: string | null
  hero_background_path: string | null
  updated_at: string | null
}

/**
 * Slots an asset can be uploaded into. A closed set on purpose: the slot name
 * becomes part of the storage path, so an open one would let a caller write
 * anywhere in the bucket.
 */
export const BRANDING_SLOTS = ['logo', 'favicon', 'hero'] as const
export type BrandingSlot = (typeof BRANDING_SLOTS)[number]

export function isBrandingSlot(value: unknown): value is BrandingSlot {
  return typeof value === 'string' && (BRANDING_SLOTS as readonly string[]).includes(value)
}

/**
 * What the bucket accepts, keyed by the extension the stored object gets.
 *
 * `image/svg+xml` is deliberately absent. The bucket's allow-list names
 * `image/svg`, which is not a type any browser sends — confirmed live, an
 * `image/svg+xml` upload is rejected outright — and an SVG served from the
 * app's own origin can carry script. Raster only until that is settled.
 */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg'
}

/** Matches the bucket's own 50 MB ceiling, so the rejection is ours and legible. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export const MAX_APP_NAME_LENGTH = 60
export const MAX_HERO_TITLE_LENGTH = 80
export const MAX_HERO_SUBTITLE_LENGTH = 200

const HEX = /^#[0-9a-f]{6}$/i

export function extensionFor(mimeType: string): string | null {
  return ALLOWED_IMAGE_TYPES[mimeType.toLowerCase()] ?? null
}

/**
 * Where a slot's object lives.
 *
 * The name carries a cache-busting suffix because a replaced image keeps the
 * same slot: without it, a public URL would serve the previous image from cache
 * for as long as the CDN felt like it.
 */
export function objectPathFor(slot: BrandingSlot, extension: string, stamp: number): string {
  return `platform/${slot}-${stamp}.${extension}`
}

export function appNameOf(record: Pick<BrandingRecord, 'app_name'> | null): string {
  const name = record?.app_name?.trim()
  return name || DEFAULT_APP_NAME
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

/**
 * Overlay values are read back defensively: they end up in an inline style, and
 * the column could have been written by a future path that skipped validation.
 */
export function overlayColorOf(record: Pick<BrandingRecord, 'hero_overlay_color'> | null): string {
  return isHexColor(record?.hero_overlay_color)
    ? record!.hero_overlay_color!.toUpperCase()
    : DEFAULT_OVERLAY_COLOR
}

export function overlayOpacityOf(
  record: Pick<BrandingRecord, 'hero_overlay_opacity'> | null
): number {
  // numeric(3,2) comes back from PostgREST as a string.
  const raw = record?.hero_overlay_opacity
  const value = typeof raw === 'string' ? Number.parseFloat(raw) : raw
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_OVERLAY_OPACITY
  return Math.min(1, Math.max(0, value))
}
