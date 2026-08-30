/**
 * Detects phone numbers in shout-out text.
 *
 * Shout-outs are public and unmoderated, so a phone number in one is a contact
 * detail broadcast to strangers and permanently out of the poster's control.
 * The product answer is "arrange it in the app", so the number never needs to
 * be there.
 *
 * Deliberately tuned to Philippine mobile numbers, which is what the platform
 * is for: 11 digits starting 09, or the +63 / 0063 / 63 international forms of
 * the same thing. Landlines (7-8 digits behind an area code) are not matched —
 * they are far more likely to collide with a score, a date or a rating, and a
 * false positive that blocks a legitimate shout-out is worse than a landline
 * getting through.
 *
 * Evasion is the real design problem, so matching runs on a *normalised* copy
 * of the text with separators and letter-shaped digits folded away. That means
 * "0917 555 1234", "0917-555-1234", "0917.555.1234" and "O9I7 555 I234" all
 * collapse to the same digit string before any pattern is applied. It will
 * never catch everything ("zero nine one seven…" spelled out in full words is
 * not attempted), and it is not trying to: it has to stop the ordinary case
 * without rejecting ordinary text.
 */

/**
 * Characters people put between digit groups, plus the letters that stand in
 * for digits when someone is trying to get around a filter. `l`/`i` are `1`,
 * `o` is `0`; `s`->`5` and `e`->`3` are deliberately NOT folded, because they
 * appear constantly in real words and folding them turns "sees" into digits.
 */
const SEPARATORS = /[\s\-.()[\]/\\_+*]/g

const LETTER_DIGITS: Record<string, string> = {
  o: '0',
  O: '0',
  l: '1',
  I: '1',
  i: '1',
  L: '1'
}

/**
 * The normalised forms a PH mobile number can take, anchored so a longer run of
 * digits (a timestamp, a long id) does not accidentally contain one.
 *
 * - 09XXXXXXXXX      — 11 digits, the everyday form
 * - 639XXXXXXXXX     — 12 digits, +63 with the + already stripped as a separator
 * - 00639XXXXXXXXX   — 14 digits, the old international prefix
 * - 9XXXXXXXXX       — 10 digits, how people write it after "+63 " or in bios
 */
const PH_MOBILE = /(?<!\d)(?:00639\d{9}|639\d{9}|09\d{9}|9\d{9})(?!\d)/

/**
 * Any run of 9+ digits. A backstop for foreign numbers and for formats the
 * specific patterns miss. Nine is chosen to sit above the things that legitimately
 * appear in a shout-out — a date, a score, a rating, a time — and below any
 * real phone number.
 */
const LONG_DIGIT_RUN = /(?<!\d)\d{9,}(?!\d)/

function normalise(text: string): string {
  let out = ''
  for (const char of text) {
    out += LETTER_DIGITS[char] ?? char
  }
  return out.replace(SEPARATORS, '')
}

/**
 * True when the text appears to contain a phone number.
 *
 * Runs against both the raw text and the normalised copy: normalising can
 * itself create a false match by joining two unrelated numbers that were only
 * separated by a space, so a hit is only trusted when the normalised string
 * genuinely holds a phone-shaped run.
 */
export function containsPhoneNumber(text: string): boolean {
  const normalised = normalise(text)
  return PH_MOBILE.test(normalised) || LONG_DIGIT_RUN.test(normalised)
}
