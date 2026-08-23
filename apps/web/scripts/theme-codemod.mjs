#!/usr/bin/env node
/**
 * Phase 2 of docs/33-DESIGN-SYSTEM-AND-THEMING-SPEC.md.
 *
 * Rewrites the ~1,950 hardcoded `-[#hex]` Tailwind classes across pages,
 * components and layouts into the semantic tokens defined in
 * assets/css/tokens.css, so the app actually responds to the theme switch.
 *
 *   node scripts/theme-codemod.mjs --dry     # report only, write nothing
 *   node scripts/theme-codemod.mjs           # apply
 *
 * Two things make this more than a find/replace:
 *
 * 1. Some hex values mean different tokens depending on the utility prefix.
 *    #2E4540 is the card border as `border-`, but the sidebar fill as `bg-`.
 *    The map is therefore keyed by prefix, with a default.
 *
 * 2. `text-white` has three distinct meanings (§3.3) and a blind replace would
 *    break every button. It is classified from the element's own background,
 *    looking first at the class string it sits in, then at the whole tag.
 *    Anything that cannot be classified confidently is LEFT ALONE and written
 *    to the report — no silent guesses.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const DIRS = ['pages', 'components', 'layouts']
const EXTRA_FILES = ['app.vue', 'error.vue']
const DRY = process.argv.includes('--dry')

/**
 * hex -> token. A string is the token for every prefix; an object keys tokens
 * by utility prefix with `default` as the fallback.
 */
const MAP = {
  // Brand
  '4db175': 'primary',
  '5fc287': 'primary-hover',
  '3a9d5e': 'primary-hover', // gradient end paired with #4DB175
  '7cdba3': 'primary-hover',
  '6ee7a0': 'primary-hover',

  // Text
  '6b7b75': { text: 'fg-muted', placeholder: 'fg-muted', default: 'fg-muted' },
  a6aba7: 'fg-secondary',
  '8a9a94': 'fg-muted',

  // Surfaces. `bg-` raises, `border-`/`ring-` draws a line — same hex, two roles.
  '0b0d09': { text: 'on-accent', default: 'canvas' },
  '0a0c08': 'canvas',
  '141d19': 'canvas',
  '0f1a17': 'canvas',
  '1e2e2a': 'surface',
  '182621': 'surface',
  '162220': 'surface',
  '132a20': 'surface',
  '2e4540': { border: 'border', ring: 'border', divide: 'border', default: 'surface-2' },
  '2a3f38': 'surface-2',
  '3a5750': { border: 'border-strong', ring: 'border-strong', divide: 'border-strong', default: 'surface-3' },

  // Gradients
  '1a2a24': 'grad-from',
  '1f322b': 'grad-from',
  '14201c': 'grad-to',
  '18262a': 'grad-to',

  // Accent
  b5b9f0: 'accent',

  // Status. Amber as a fill keeps the brand colour and carries dark text; as
  // text it must darken in light mode to clear AA.
  f5a623: { text: 'warning', default: 'warning-fill' },
  d4920f: { text: 'warning', default: 'warning-fill' },

  // Rating tiers
  cd7f32: 'rating-bronze',
  a66628: 'rating-bronze',
  c0c0c0: 'rating-silver',
  a0a0a0: 'rating-silver'
}

/** A fill that carries `text-on-primary`. */
const BRAND_FILL =
  /(?:bg|from|via|to)-(?:\[#(?:4db175|5fc287|3a9d5e|7cdba3|6ee7a0)\]|primary(?:-hover)?\b)/i

/**
 * Light fills — rating medals, brand amber, the accent — which need a DARK
 * label in both themes. `text-white` on `bg-rating-bronze` is 2.6:1 in dark
 * mode; `text-on-accent` clears AA on both.
 */
const BRIGHT_FILL =
  /(?:bg|from|via|to)-(?:\[#(?:f5a623|d4920f)\]|rating-[a-z]+|warning-fill|accent(?:-soft)?\b)/i

/**
 * Fills that keep a literal white label: deep reds and other saturated darks
 * where `on-primary` (near-black in dark mode) would be unreadable.
 */
const KEEP_WHITE_FILL =
  /(?:bg|from|via|to)-(?:\[#ff[0-9a-f]{4}\]|danger[a-z-]*|red-\d|rose-\d|indigo-\d|purple-\d)/i

/**
 * Any background at all, used to decide "this element paints its own ground".
 * The leading \b matters: without it the `to-` alternative matches inside
 * ordinary utilities like `auto-rows-min` or `pointer-events-auto`, which would
 * make almost every class string look like it had a fill.
 */
const ANY_FILL = /\b(?:bg|from|via|to)-[a-z0-9#\-/[\]]+/i

const PREFIXES =
  'bg|text|border|from|to|via|ring|fill|stroke|divide|placeholder|shadow|decoration|outline|accent|caret'
const HEX_CLASS = new RegExp(`\\b(${PREFIXES})-\\[#([0-9A-Fa-f]{3,8})\\](/\\d{1,3})?`, 'g')

const report = { files: 0, hex: 0, white: 0, unmapped: new Map(), ambiguous: [], whiteBreakdown: new Map(), leftover: [] }

function tokenFor(prefix, hex) {
  const entry = MAP[hex.toLowerCase()]
  if (!entry) return null
  return typeof entry === 'string' ? entry : (entry[prefix] ?? entry.default ?? null)
}

/** Collects every source file the codemod should touch. */
function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collect(full, out)
    else if (name.endsWith('.vue')) out.push(full)
  }
  return out
}

/** Labels that mean "a colour chosen for the fill underneath", not a real colour. */
const LABEL = /\btext-(?:white|canvas)\b/g

/**
 * Decides what a label should become, given the class string it sits in and the
 * surrounding context (the enclosing tag, or the whole statement in a script
 * block). Returns null when nothing in scope says anything about a background —
 * the caller reports that rather than guessing.
 */
function decide(scope, outer) {
  for (const text of [scope, outer]) {
    if (!text) continue
    if (BRIGHT_FILL.test(text)) return 'text-on-accent'
    if (KEEP_WHITE_FILL.test(text)) return 'text-white'
    if (BRAND_FILL.test(text)) return 'text-on-primary'
    if (ANY_FILL.test(text)) return 'text-fg'
  }
  return null
}

/**
 * Rewrites labels inside `region`, judging one quoted string at a time.
 *
 * Recursion matters: a `:class` attribute is a single double-quoted string
 * whose body holds two single-quoted ternary branches. Judging the outer string
 * as a unit let one branch's `hover:bg-danger/20` decide the other branch's
 * label. Descending into the nested quotes scores each branch on its own.
 */
function classifyLabels(region, file, outer = '', regionIsContext = true) {
  if (!LABEL.test(region)) return region
  LABEL.lastIndex = 0

  // On the whole-file sweep the "region" is the entire file, which is not
  // meaningful context — some fill matches somewhere in every file, so every
  // leftover label would inherit a background it has nothing to do with.
  const context = regionIsContext ? `${region} ${outer}` : outer

  return region.replace(/(['"`])((?:(?!\1)[\s\S])*?)\1/g, (whole, quote, body) => {
    if (!LABEL.test(body)) return whole
    LABEL.lastIndex = 0

    // Nested quotes: recurse instead of scoring the container. A nested branch
    // does get its container as context — that is a real enclosing scope.
    if (/['"`]/.test(body)) {
      return quote + classifyLabels(body, file, context) + quote
    }

    const replacement = decide(body, context)
    if (!replacement) {
      // Nothing in scope paints a background, so the element sits on a card or
      // the canvas and the label means "primary text".
      const count = (body.match(LABEL) || []).length
      LABEL.lastIndex = 0
      report.white += count
      report.whiteBreakdown.set('text-fg (no fill in scope)', (report.whiteBreakdown.get('text-fg (no fill in scope)') ?? 0) + count)
      return quote + body.replace(LABEL, 'text-fg') + quote
    }

    const count = (body.match(LABEL) || []).length
    LABEL.lastIndex = 0
    report.white += count
    report.whiteBreakdown.set(replacement, (report.whiteBreakdown.get(replacement) ?? 0) + count)
    return quote + body.replace(LABEL, replacement) + quote
  })
}

const files = [
  ...DIRS.flatMap((d) => collect(join(ROOT, d))),
  ...EXTRA_FILES.map((f) => join(ROOT, f))
]

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const original = readFileSync(file, 'utf8')

  // 1. hex -> token
  let next = original.replace(HEX_CLASS, (whole, prefix, hex, alpha = '') => {
    const token = tokenFor(prefix, hex)
    if (!token) {
      const key = `${prefix}-[#${hex.toLowerCase()}]`
      report.unmapped.set(key, (report.unmapped.get(key) ?? 0) + 1)
      return whole
    }
    report.hex++
    return `${prefix}-${token}${alpha}`
  })

  // 2. Labels. Tags first, so an element's own attributes are the scope; then a
  // whole-file sweep to catch class strings that live in <script> object
  // literals and computed returns, which no tag encloses.
  next = next.replace(/<[a-zA-Z][^>]*>/g, (tag) => classifyLabels(tag, rel))
  // No outer context on the sweep: the "context" would be the entire file, and
  // some fill always matches somewhere in a file, so every leftover label would
  // inherit a background it has nothing to do with. Here a class string is
  // judged on itself or not at all.
  next = classifyLabels(next, rel, '', false)

  // Whatever survived both passes. Pairing quotes with a regex across a whole
  // file is fragile — an apostrophe in a comment is enough to misalign it — so
  // rather than pretend otherwise, leftovers are reported for a human.
  for (const [i, line] of next.split('\n').entries()) {
    if (LABEL.test(line)) report.leftover.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`)
    LABEL.lastIndex = 0
  }

  if (next !== original) {
    report.files++
    if (!DRY) writeFileSync(file, next)
  }
}

console.log(`${DRY ? '[dry run] ' : ''}files changed: ${report.files}`)
console.log(`hex classes rewritten: ${report.hex}`)
console.log(`text-white classified: ${report.white}`)
for (const [k, v] of [...report.whiteBreakdown].sort((a, b) => b[1] - a[1])) console.log(`  ${v.toString().padStart(4)}  → ${k}`)

if (report.unmapped.size) {
  console.log('\nUNMAPPED — left untouched, add to MAP or fix by hand:')
  for (const [key, count] of [...report.unmapped].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)}  ${key}`)
  }
}

if (report.ambiguous.length) {
  console.log(`\nINFERRED FROM TAG (${report.ambiguous.length}) — worth eyeballing:`)
  for (const line of report.ambiguous.slice(0, 25)) console.log(`  ${line}`)
  if (report.ambiguous.length > 25) console.log(`  … ${report.ambiguous.length - 25} more`)
}

if (report.leftover.length) {
  console.log(`\nLEFT FOR A HUMAN (${report.leftover.length}) — not classified, still literal:`)
  for (const line of report.leftover) console.log(`  ${line}`)
}
