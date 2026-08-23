/**
 * Guards the design token layer (assets/css/tokens.css).
 *
 * Two classes of regression this catches:
 *   1. A token added to one theme and forgotten in the other, which renders as
 *      an unresolved `var()` — usually transparent, and easy to miss in review.
 *   2. A colour pair that stops meeting WCAG AA. Three of the values inherited
 *      from the dark-only palette already failed (see docs/33 §3.2); without a
 *      test they drift straight back.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Resolved from the Vitest root (apps/web) rather than `import.meta.url`: under
// the happy-dom environment `import.meta.url` is not a file: URL.
const TOKENS_CSS = readFileSync(resolve(process.cwd(), 'assets/css/tokens.css'), 'utf8')

type Rgb = [number, number, number]

/** Pulls the `--dnl-*: r g b;` declarations out of one selector block. */
function parseBlock(selector: string): Record<string, Rgb> {
  const start = TOKENS_CSS.indexOf(`${selector} {`)
  expect(start, `tokens.css is missing a \`${selector}\` block`).toBeGreaterThan(-1)
  const end = TOKENS_CSS.indexOf('\n}', start)
  const body = TOKENS_CSS.slice(start, end)

  const tokens: Record<string, Rgb> = {}
  const pattern = /--dnl-([a-z0-9-]+):\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*;/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])]
  }
  return tokens
}

const light = parseBlock(':root')
const dark = parseBlock('.dark')

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Foreground/background pairs that must stay legible, with the minimum ratio
 * the content at that size requires. 4.5 is AA for body text; 3.0 is AA for
 * text at 24px+ and for non-text UI boundaries.
 */
const CONTRAST_PAIRS: Array<{ fg: string; bg: string; min: number; why: string }> = [
  { fg: 'fg', bg: 'canvas', min: 4.5, why: 'body copy on the page' },
  { fg: 'fg', bg: 'surface', min: 4.5, why: 'body copy on a card' },
  { fg: 'fg-secondary', bg: 'canvas', min: 4.5, why: 'secondary copy on the page' },
  { fg: 'fg-secondary', bg: 'surface', min: 4.5, why: 'secondary copy on a card' },
  {
    fg: 'fg-muted',
    bg: 'canvas',
    min: 4.5,
    why: '12px captions — the mockup uses these at caption size'
  },
  { fg: 'fg-muted', bg: 'surface', min: 4.5, why: '12px captions on a card' },
  // surface-2 is not just a fill: it carries the tab count pills, the Draft
  // status pill, segmented-control tracks and every nav hover state. Omitting
  // it here is what let four real axe failures through in dark mode.
  { fg: 'fg', bg: 'surface-2', min: 4.5, why: 'text on a secondary fill' },
  { fg: 'fg-secondary', bg: 'surface-2', min: 4.5, why: 'segmented control and nav hover labels' },
  { fg: 'fg-muted', bg: 'surface-2', min: 4.5, why: 'count pills and the Draft status pill' },
  // primary-soft is a real background: the active nav item and the "this is you"
  // rankings row sit on it, and the row carries status colours too. It was the
  // raw primary in dark mode, which made that row 1.0:1.
  { fg: 'fg', bg: 'primary-soft', min: 4.5, why: 'text in the highlighted rankings row' },
  {
    fg: 'primary',
    bg: 'primary-soft',
    min: 4.5,
    why: 'the active nav item labels itself in brand'
  },
  {
    fg: 'fg-secondary',
    bg: 'primary-soft',
    min: 4.5,
    why: 'secondary cells in the highlighted row'
  },
  { fg: 'danger', bg: 'primary-soft', min: 4.5, why: 'a losing trend inside the highlighted row' },
  { fg: 'primary', bg: 'canvas', min: 4.5, why: 'brand-coloured links and stat numbers' },
  { fg: 'primary', bg: 'surface', min: 4.5, why: 'brand-coloured text on a card' },
  { fg: 'on-primary', bg: 'primary', min: 4.5, why: 'button labels on the brand fill' },
  {
    fg: 'on-accent',
    bg: 'accent',
    min: 4.5,
    why: 'text on the accent fill (highlighted rank row)'
  },
  { fg: 'danger', bg: 'canvas', min: 4.5, why: 'Disputed status and the Dispute action' },
  { fg: 'danger', bg: 'surface', min: 4.5, why: 'Disputed status on a card' },
  { fg: 'warning', bg: 'canvas', min: 4.5, why: 'Pending status text' },
  { fg: 'warning', bg: 'surface', min: 4.5, why: 'Pending status on a card' },
  { fg: 'info', bg: 'canvas', min: 4.5, why: 'informational toast text' },
  { fg: 'info', bg: 'surface', min: 4.5, why: 'informational text on a card' },
  { fg: 'rating-gold', bg: 'surface', min: 3, why: 'rating badge, large glyph' },
  { fg: 'rating-silver', bg: 'surface', min: 3, why: 'rating badge, large glyph' },
  { fg: 'rating-bronze', bg: 'surface', min: 3, why: 'rating badge, large glyph' },
  { fg: 'rating-iron', bg: 'surface', min: 3, why: 'rating badge, large glyph' },
  { fg: 'border-strong', bg: 'surface', min: 1.4, why: 'input borders must be perceivable' }
]

describe('design tokens', () => {
  it('declares tokens in both themes', () => {
    expect(Object.keys(light).length).toBeGreaterThan(20)
    expect(Object.keys(dark).length).toBeGreaterThan(20)
  })

  it('defines every light token in dark and vice versa', () => {
    const missingInDark = Object.keys(light).filter((name) => !(name in dark))
    const missingInLight = Object.keys(dark).filter((name) => !(name in light))

    expect(missingInDark, 'tokens declared on :root but not on .dark').toEqual([])
    expect(missingInLight, 'tokens declared on .dark but not on :root').toEqual([])
  })

  it('keeps every channel in range', () => {
    for (const [theme, tokens] of [
      ['light', light],
      ['dark', dark]
    ] as const) {
      for (const [name, rgb] of Object.entries(tokens)) {
        for (const channel of rgb) {
          expect(
            channel,
            `${theme} --dnl-${name} has an out-of-range channel`
          ).toBeGreaterThanOrEqual(0)
          expect(channel, `${theme} --dnl-${name} has an out-of-range channel`).toBeLessThanOrEqual(
            255
          )
        }
      }
    }
  })

  it.each(CONTRAST_PAIRS)('light: $fg on $bg meets $min:1 ($why)', ({ fg, bg, min }) => {
    expect(contrast(light[fg], light[bg])).toBeGreaterThanOrEqual(min)
  })

  it.each(CONTRAST_PAIRS)('dark: $fg on $bg meets $min:1 ($why)', ({ fg, bg, min }) => {
    expect(contrast(dark[fg], dark[bg])).toBeGreaterThanOrEqual(min)
  })

  it('sets color-scheme per theme so native controls follow', () => {
    expect(TOKENS_CSS).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/)
    expect(TOKENS_CSS).toMatch(/\.dark\s*\{[^}]*color-scheme:\s*dark/)
  })

  it('gates the theme transition behind reduced-motion', () => {
    // Match the selector, not the bare class name — the surrounding comment
    // mentions the class too, and an index comparison would pick that up.
    const selectorIndex = TOKENS_CSS.indexOf('html.dnl-theme-switching')
    const mediaIndex = TOKENS_CSS.indexOf('@media (prefers-reduced-motion: no-preference)')
    expect(selectorIndex, 'the theme-switch transition selector is missing').toBeGreaterThan(-1)
    expect(mediaIndex, 'the reduced-motion guard is missing').toBeGreaterThan(-1)
    expect(mediaIndex, 'the transition must sit inside the reduced-motion guard').toBeLessThan(
      selectorIndex
    )
  })
})
