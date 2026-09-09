/**
 * Initials for an avatar fallback.
 *
 * Sixteen places in the app wrote `name.charAt(0).toUpperCase()` inline, which
 * takes whatever character happens to be first — so a seeded "[DEMO] Ana Cruz"
 * put a bracket in every list row, card and header where that player appeared,
 * and a club written "'Pins & Paddles'" put a quote mark. A bracket is not an
 * identity. Leading punctuation is skipped, and a word that is nothing but
 * punctuation drops out, so the letters always come from the name itself.
 *
 * `UiAvatar` uses the two-letter form; the inline fallbacks that only have room
 * for one character pass `max: 1`.
 */
export function initialsFor(name?: string | null, max: 1 | 2 = 2): string {
  const parts = (name ?? '')
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter(Boolean)

  if (!parts.length) return '?'

  return parts
    .slice(0, max)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}
