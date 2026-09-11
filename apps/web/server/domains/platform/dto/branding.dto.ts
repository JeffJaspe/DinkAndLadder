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

/**
 * How strongly the landing background image reads, 0 (invisible) to 1
 * (untouched).
 *
 * 0.08 is not a taste call: the landing page lays a flat wash of the theme's
 * own canvas over the artwork at 0.92, which leaves exactly this much of the
 * image showing. Keeping the default identical means an operator who never
 * touches the slider sees the page they already had.
 */
export const DEFAULT_BACKGROUND_OPACITY = 0.08

/**
 * The point in the landing background that every crop keeps centred, as a
 * fraction of the image's width and height (0/0 top-left, 1/1 bottom-right).
 * The centre is what the page painted before the operator could choose.
 */
export const DEFAULT_FOCAL_X = 0.5
export const DEFAULT_FOCAL_Y = 0.5

/**
 * The plate under the headline: its strength, and how wide its edge dissolves
 * into the artwork (a share of the band's width on wide screens, of the
 * viewport width on phones). 0.92 and 0.11 are what the page painted before
 * either was configurable. The plate's colour has no default constant: NULL
 * means the theme's own canvas, the only colour correct in both themes.
 */
export const DEFAULT_PLATE_OPACITY = 0.92
export const DEFAULT_FADE = 0.11

export interface BrandingRecord {
  app_name: string | null
  logo_path: string | null
  favicon_path: string | null
  hero_title: string | null
  hero_subtitle: string | null
  hero_background_path: string | null
  hero_overlay_color: string | null
  hero_overlay_opacity: number | string | null
  hero_background_opacity: number | string | null
  hero_focal_x: number | string | null
  hero_focal_y: number | string | null
  hero_plate_color: string | null
  hero_plate_opacity: number | string | null
  hero_fade: number | string | null
  branding_updated_at: string | null
}

export interface HeroDto {
  /** null means the landing page keeps its built-in copy. */
  title: string | null
  subtitle: string | null
  background_url: string | null
  overlay_color: string
  overlay_opacity: number
  /** 0 (invisible) to 1 (untouched). See DEFAULT_BACKGROUND_OPACITY. */
  background_opacity: number
  /** Focal point of the background image, 0..1 on each axis. See DEFAULT_FOCAL_X. */
  focal_x: number
  focal_y: number
  /** #RRGGBB, or null for the theme's own canvas. */
  plate_color: string | null
  /** 0..1. See DEFAULT_PLATE_OPACITY. */
  plate_opacity: number
  /** 0 (hard edge) .. 1. See DEFAULT_FADE. */
  fade: number
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
  return clampedOpacity(record?.hero_overlay_opacity, DEFAULT_OVERLAY_OPACITY)
}

export function backgroundOpacityOf(
  record: Pick<BrandingRecord, 'hero_background_opacity'> | null
): number {
  return clampedOpacity(record?.hero_background_opacity, DEFAULT_BACKGROUND_OPACITY)
}

export function focalXOf(record: Pick<BrandingRecord, 'hero_focal_x'> | null): number {
  return clampedOpacity(record?.hero_focal_x, DEFAULT_FOCAL_X)
}

export function focalYOf(record: Pick<BrandingRecord, 'hero_focal_y'> | null): number {
  return clampedOpacity(record?.hero_focal_y, DEFAULT_FOCAL_Y)
}

export function plateColorOf(record: Pick<BrandingRecord, 'hero_plate_color'> | null): string | null {
  return isHexColor(record?.hero_plate_color) ? record!.hero_plate_color!.toUpperCase() : null
}

export function plateOpacityOf(
  record: Pick<BrandingRecord, 'hero_plate_opacity'> | null
): number {
  return clampedOpacity(record?.hero_plate_opacity, DEFAULT_PLATE_OPACITY)
}

export function fadeOf(record: Pick<BrandingRecord, 'hero_fade'> | null): number {
  return clampedOpacity(record?.hero_fade, DEFAULT_FADE)
}

/**
 * A hex colour as the "r g b" triplet the token system's custom properties
 * carry, so a custom plate colour drops into `rgb(var(--x) / a)` unchanged.
 */
export function rgbTripletOf(hex: string): string {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16)).join(' ')
}

/**
 * The CSS background-position that keeps the focal point in view. With
 * `background-size: cover`, a position of X% Y% aligns the X% point of the
 * image with the X% point of the box, which is exactly "keep this point in
 * every crop" - the reason the focal point is stored as fractions.
 */
export function focalPositionOf(hero: Pick<HeroDto, 'focal_x' | 'focal_y'>): string {
  return `${toPercent(hero.focal_x)}% ${toPercent(hero.focal_y)}%`
}

function toPercent(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10
}

/** numeric(3,2) comes back from PostgREST as a string. */
function clampedOpacity(raw: number | string | null | undefined, fallback: number): number {
  const value = typeof raw === 'string' ? Number.parseFloat(raw) : raw
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}
