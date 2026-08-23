/**
 * Platform theme palettes (docs/30-SUPER-ADMIN-SPECIFICATION.md §2.2, revised —
 * see database/liquibase/024-platform-theme for the two departures from the
 * spec as written).
 *
 * A palette retints the brand tokens only, and carries a light and a dark set
 * because those genuinely differ: the same green cannot both read as text on a
 * near-white canvas and carry white as a button fill on near-black.
 *
 * The catalog is data. Nothing here lists the palettes — only which tokens a
 * palette is allowed to set, which is a property of the design system rather
 * than of any one palette.
 */

/**
 * Tokens a palette may override, without the `--dnl-` prefix.
 *
 * Deliberately brand-only. Surfaces, text, borders and status colours stay with
 * the design system, so no palette can make body text unreadable — the failure
 * mode a free-form colour picker has.
 */
export const PALETTE_TOKENS = [
  'primary',
  'primary-hover',
  'primary-soft',
  'on-primary',
  'accent',
  'accent-soft',
  'on-accent'
] as const

export type PaletteToken = (typeof PALETTE_TOKENS)[number]

/** `token -> #RRGGBB`, as stored. */
export type PaletteColors = Partial<Record<PaletteToken, string>>

export interface ThemePaletteRecord {
  id: string
  key: string
  name: string
  description: string | null
  light: Record<string, unknown> | null
  dark: Record<string, unknown> | null
  display_order: number
}

export interface ThemePaletteDto {
  key: string
  name: string
  description: string | null
  light: PaletteColors
  dark: PaletteColors
  display_order: number
}

const HEX = /^#[0-9a-f]{6}$/i

function isPaletteToken(value: string): value is PaletteToken {
  return (PALETTE_TOKENS as readonly string[]).includes(value)
}

/**
 * Keeps only recognised tokens holding a full 6-digit hex.
 *
 * Anything else is dropped rather than passed through: these values are
 * interpolated into a stylesheet, so a stored string that is not a colour is
 * either a mistake or an injection attempt, and in both cases the token should
 * fall back to the design system's own value.
 */
export function sanitizePaletteColors(stored: unknown): PaletteColors {
  const colors: PaletteColors = {}
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return colors

  for (const [token, value] of Object.entries(stored as Record<string, unknown>)) {
    if (!isPaletteToken(token)) continue
    if (typeof value !== 'string' || !HEX.test(value)) continue
    colors[token] = value.toUpperCase()
  }
  return colors
}

export function toThemePaletteDto(record: ThemePaletteRecord): ThemePaletteDto {
  return {
    key: record.key,
    name: record.name,
    description: record.description,
    light: sanitizePaletteColors(record.light),
    dark: sanitizePaletteColors(record.dark),
    display_order: record.display_order
  }
}

/** `#0A7F45` → `10 127 69`, the space-separated channels the tokens hold. */
export function hexToRgbChannels(hex: string): string | null {
  if (!HEX.test(hex)) return null
  const value = hex.slice(1)
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

/**
 * The stylesheet that puts a palette on the page.
 *
 * `html:root` and `html:root.dark` rather than `:root` / `.dark`: this rides in
 * the document head alongside the bundled token stylesheet, and load order
 * between the two is not something a page should depend on. Adding the element
 * selector raises specificity so the palette wins either way.
 *
 * Returns an empty string when there is nothing to say, so the caller can skip
 * emitting a `<style>` element at all.
 */
export function paletteToCss(palette: Pick<ThemePaletteDto, 'light' | 'dark'> | null): string {
  if (!palette) return ''

  const block = (selector: string, colors: PaletteColors): string => {
    const declarations = Object.entries(colors)
      .map(([token, hex]) => {
        const channels = hexToRgbChannels(hex as string)
        return channels ? `--dnl-${token}: ${channels};` : null
      })
      .filter(Boolean)

    return declarations.length ? `${selector}{${declarations.join('')}}` : ''
  }

  return [block('html:root', palette.light), block('html:root.dark', palette.dark)]
    .filter(Boolean)
    .join('')
}
