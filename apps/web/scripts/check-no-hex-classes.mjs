#!/usr/bin/env node
/**
 * Fails the build on any hardcoded colour class in the UI layer.
 *
 * Phase 2 converted ~1,960 `-[#hex]` classes to semantic tokens. Without a
 * guard the codebase drifts straight back — one hex at a time, each individually
 * reasonable — and the light theme quietly rots. See docs/33 §3.6.
 *
 *   node scripts/check-no-hex-classes.mjs
 *
 * If you genuinely need a colour that no token covers, add the token to
 * assets/css/tokens.css (in BOTH themes) rather than inlining a hex here.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const DIRS = ['pages', 'components', 'layouts']
const EXTRA_FILES = ['app.vue', 'error.vue']

const PREFIXES =
  'bg|text|border|from|to|via|ring|fill|stroke|divide|placeholder|shadow|decoration|outline|accent|caret'
const HEX_CLASS = new RegExp(`\\b(?:${PREFIXES})-\\[#[0-9A-Fa-f]{3,8}\\]`, 'g')

/**
 * `text-white` is allowed only on a fill that genuinely needs a white label —
 * reds and other saturated darks, where `text-on-primary` (near-black in dark
 * mode) would be unreadable. Anywhere else it defeats the theme.
 */
const WHITE = /\btext-white\b/
const WHITE_OK = /(?:bg|from|via|to)-(?:danger[a-z-]*|red-\d|rose-\d|indigo-\d|purple-\d|\[#ff[0-9a-f]{4}\])/i

function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collect(full, out)
    else if (name.endsWith('.vue')) out.push(full)
  }
  return out
}

const files = [
  ...DIRS.flatMap((d) => collect(join(ROOT, d))),
  ...EXTRA_FILES.map((f) => join(ROOT, f))
]

const violations = []

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const lines = readFileSync(file, 'utf8').split('\n')

  lines.forEach((line, i) => {
    for (const hit of line.match(HEX_CLASS) ?? []) {
      violations.push(`${rel}:${i + 1}  ${hit}  — use a token from assets/css/tokens.css`)
    }
    if (WHITE.test(line) && !WHITE_OK.test(line)) {
      violations.push(`${rel}:${i + 1}  text-white  — use text-fg, text-on-primary or text-on-accent`)
    }
  })
}

if (violations.length) {
  console.error(`Hardcoded colour classes found (${violations.length}):\n`)
  for (const v of violations) console.error(`  ${v}`)
  console.error('\nAdd a token to assets/css/tokens.css instead of inlining a colour.')
  process.exit(1)
}

console.log(`No hardcoded colour classes in ${files.length} files.`)
