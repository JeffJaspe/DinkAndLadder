#!/usr/bin/env node
/**
 * Gives the light theme's cards a visible edge.
 *
 * The dark theme separates a card from the page by lightness — #1E2E2A on a
 * #0B0D09 canvas. The light theme cannot: `--dnl-surface` is #FFFFFF and
 * `--dnl-canvas` is #F7F9F8, which is 1.06:1. Nothing but elevation tells the
 * eye where a card begins, and 152 panels were carrying no elevation at all,
 * so light mode read as one undifferentiated sheet.
 *
 *   node scripts/card-shadow-codemod.mjs --dry   # report only, write nothing
 *   node scripts/card-shadow-codemod.mjs         # apply
 *
 * What makes this narrower than a find/replace:
 *
 * 1. `bg-surface` is matched as a whole token. `bg-surface-2` and `bg-surface/50`
 *    are different tokens (secondary fills, nested rows) and must not be raised
 *    — a shadow on a row *inside* a card is worse than no shadow at all.
 *
 * 2. Only card-sized radii qualify: `rounded-card`, `rounded-xl`, `rounded-2xl`.
 *    `rounded-button` and `rounded-lg` are what inputs and buttons use, and a
 *    form field is not a card.
 *
 * 3. Skeletons (`animate-pulse`) are placeholders for a card, not a card. A
 *    shadow on a pulsing grey block draws the eye to the loading state.
 *
 * 4. Anything that already declares a shadow is left exactly as it is.
 *
 * Elements that already animate a hover also get `hover:shadow-card-hover`, so
 * an interactive card lifts on hover the way the components in `components/cards`
 * already do. A static panel gets the resting shadow only.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const DIRS = ['pages', 'components', 'layouts']
const CARD_RADII = /\brounded-(card|xl|2xl)\b/
// `bg-surface` and nothing else: a trailing `-` (surface-2) or `/` (alpha) is
// a different token with a different job.
const SURFACE = /\bbg-surface(?![-/\w])/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.vue')) out.push(full)
  }
  return out
}

function isCard(classList) {
  if (!CARD_RADII.test(classList)) return false
  if (!SURFACE.test(classList)) return false
  if (/\bshadow-/.test(classList)) return false
  if (/\banimate-pulse\b/.test(classList)) return false
  return true
}

function raise(classList) {
  // A card that already animates on hover is interactive, so it lifts on hover
  // the way the components in `components/cards` do. A static panel gets the
  // resting shadow only. Appending keeps the diff to one place per class list;
  // Tailwind is order-independent.
  const interactive = /\btransition-/.test(classList) && /\bhover:/.test(classList)
  const shadow = interactive ? 'shadow-card hover:shadow-card-hover' : 'shadow-card'
  return `${classList.trimEnd()} ${shadow}`
}

const dry = process.argv.includes('--dry')
const files = DIRS.flatMap((d) => walk(join(ROOT, d)))
let changed = 0
let touchedFiles = 0
const report = []

for (const file of files) {
  const before = readFileSync(file, 'utf8')
  let hits = 0

  // Anchored on the attribute rather than on quote pairs. An earlier pass
  // scanned every quoted string and desynchronized on `v-if="x.length > 0"`:
  // the `>` broke the pairing and the following class attribute was skipped.
  // An HTML attribute value cannot contain the quote that delimits it, so
  // `[^"]*` is both safe and newline-tolerant here.
  let after = before.replace(/(?<![:@\w-])class="([^"]*)"/g, (whole, body) => {
    if (!isCard(body)) return whole
    hits += 1
    return `class="${raise(body)}"`
  })

  // `:class` holds an expression, not a class list. Only the string literals
  // inside it are candidates — the conditional card styles live there.
  after = after.replace(/(:class|v-bind:class)="([^"]*)"/g, (whole, name, expr) => {
    const rewritten = expr.replace(/'([^']*)'/g, (lit, body) => {
      if (!isCard(body)) return lit
      hits += 1
      return `'${raise(body)}'`
    })
    return `${name}="${rewritten}"`
  })

  if (hits > 0) {
    changed += hits
    touchedFiles += 1
    report.push(`${relative(ROOT, file)}  ${hits}`)
    if (!dry) writeFileSync(file, after)
  }
}

console.log(report.sort().join('\n'))
console.log(
  `\n${changed} class lists raised across ${touchedFiles} files${dry ? ' (dry run)' : ''}`
)
