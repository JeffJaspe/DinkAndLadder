/**
 * Recovery codes for two-factor authentication.
 *
 * Supabase has no recovery codes, and a recovery code cannot raise a session
 * to aal2, so ours are a self-service RESET: presenting one removes every
 * factor so the owner can sign in with their password and enrol again. That
 * makes the code exactly as powerful as "turn 2FA off", which is why it is
 * stored hashed, shown once, and single-use.
 *
 * Pure functions so the format and the hashing can be tested without a
 * database. Hashing uses the Web Crypto API, which exists in both Nitro and
 * the browser — not that the browser ever hashes one.
 */

/**
 * No 0/O or 1/I: a code read off a piece of paper months later must not have
 * two characters that look the same in most handwriting and many fonts.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const RECOVERY_CODE_COUNT = 8
const GROUP = 4
const GROUPS = 2

/** `ABCD-EFGH` — two groups of four from the ambiguity-free alphabet. */
export function generateRecoveryCode(): string {
  const bytes = new Uint8Array(GROUP * GROUPS)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length])
  const groups: string[] = []
  for (let i = 0; i < GROUPS; i++) {
    groups.push(chars.slice(i * GROUP, (i + 1) * GROUP).join(''))
  }
  return groups.join('-')
}

/** Distinct codes: a duplicate would silently leave the owner one short. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>()
  while (codes.size < count) codes.add(generateRecoveryCode())
  return [...codes]
}

/**
 * What a person types is never exactly what was shown: lower case, a missing
 * or extra dash, a space, an `O` for a `0` they were never given. Everything
 * collapses to the canonical `XXXX-XXXX` before hashing, so the comparison is
 * against what we would have generated. Returns null for anything that cannot
 * be a code at all.
 */
export function normaliseRecoveryCode(input: string): string | null {
  const stripped = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (stripped.length !== GROUP * GROUPS) return null
  if (![...stripped].every((c) => ALPHABET.includes(c))) return null
  return `${stripped.slice(0, GROUP)}-${stripped.slice(GROUP)}`
}

/**
 * SHA-256 of the code bound to the user id. Binding means the same code
 * issued to two accounts hashes differently, and a leaked hash table gives
 * nothing that works across accounts. Recovery codes carry ~40 bits of
 * entropy, which is plenty against an online attacker who is rate-limited by
 * Turnstile and the password check, and hex SHA-256 is fast enough that the
 * check adds nothing to the request.
 */
export async function hashRecoveryCode(code: string, userId: string): Promise<string> {
  const data = new TextEncoder().encode(`${code}:${userId}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
