/**
 * A player's own gradient, derived from who they are.
 *
 * Every avatar in the app renders the DinkAndLadder mark, which is right on a
 * profile header and wrong everywhere a list repeats it: a bracket showed
 * sixteen identical logos, a queue eight. An avatar that cannot tell two people
 * apart is weight without information.
 *
 * So a photoless player gets initials on a gradient generated from their id.
 * Derived, never random: the same player is the same colour on the bracket, in
 * the queue, on the feed and on their profile, across devices and sessions,
 * with nothing stored. Random-per-render would make the avatar a decoration
 * rather than a way to recognise somebody.
 *
 * ── Why OKLCH, and why these exact numbers ──────────────────────────────────
 *
 * The initials have to stay legible on every gradient this can produce, and
 * WCAG AA is an enforced floor in this project — so the colour cannot simply be
 * `hsl(random, 70%, 50%)`. HSL lightness is not perceived lightness: yellow and
 * blue at `L=50%` differ by more than 4:1 in luminance, so a fixed ink passes on
 * one and fails on the other.
 *
 * OKLCH lightness *is* perceptual, so holding L fixed and spinning only the hue
 * keeps measured contrast nearly constant. The constants below were solved
 * numerically rather than picked: at `C=0.16`, white ink clears 4.5:1 against
 * the lighter stop at every one of the 360 hues, worst case **4.98:1** at hue
 * ~192 (cyan, the luminance peak). `tests/unit/avatar-identity.spec.ts` walks
 * all 360 and fails if that ever stops being true.
 *
 * Both stops are measured, not just one: the initials sit across the whole
 * area, so the *lighter* end is the one that has to hold, and the darker end
 * only ever helps.
 *
 * Gamut clamping happens in linear space before the transfer function, and the
 * contrast above is measured on the clamped result — some (L, C, h) triples
 * fall outside sRGB, and clamping moves luminance.
 */

/** Perceptual lightness of the two gradient stops. See the header. */
const STOP_LIGHT_L = 0.5
const STOP_DARK_L = 0.42
/** Chroma. Higher reads as a real colour rather than a wash; 0.16 is the most
 *  saturation that still leaves the lighter stop above AA at every hue. */
const STOP_C = 0.16

/** How far the second stop's hue travels. Enough to read as a gradient, close
 *  enough to stay one colour rather than a rainbow smear. */
const HUE_SPREAD_MIN = 24
const HUE_SPREAD_STEPS = 16

/** Gradient directions, in degrees. Eight is plenty of variety and every one
 *  still reads as a single sweep at 24px. */
const ANGLE_STEPS = 8

export interface AvatarIdentity {
  /** Lighter stop, `#rrggbb`. */
  from: string
  /** Darker stop, `#rrggbb`. */
  to: string
  /** Gradient direction in degrees. */
  angle: number
  /** Ink for the initials. Always white — see the header. */
  ink: string
  /** Ready for a `background-image` binding. */
  gradient: string
}

/**
 * MurmurHash3's finalizer. Avalanche, not hashing.
 *
 * FNV-1a alone is not good enough for what this module does with the result.
 * Two keys differing only in the last character produce hashes differing by a
 * FIXED delta — the tail multiply — and `2 × 16777619 mod 360` is −2, so
 * `player-0`, `player-2` and `player-4` came out two degrees apart: three
 * indistinguishable olive avatars in a row. The high bits moved even less, so
 * every avatar in the app shared one gradient angle.
 *
 * UUIDs would have hidden it. Any id with structure, or a seeded roster, would
 * not. Mixing before slicing decorrelates the bits so neighbouring keys land
 * nowhere near each other.
 */
function fmix32(h: number): number {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

/** FNV-1a, 32-bit, avalanched. Small, dependency-free, and well spread. */
export function hashKey(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    // × 16777619 without overflowing into float precision.
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return fmix32(h)
}

const srgbTransfer = (x: number) =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055

const toHex = (channel: number) =>
  Math.round(Math.min(1, Math.max(0, channel)) * 255)
    .toString(16)
    .padStart(2, '0')

/** OKLCH → `#rrggbb`, clamped into sRGB in linear space. */
export function oklchToHex(lightness: number, chroma: number, hueDeg: number): string {
  const h = (hueDeg * Math.PI) / 180
  const a = chroma * Math.cos(h)
  const b = chroma * Math.sin(h)

  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ].map((c) => Math.min(1, Math.max(0, c)))

  return `#${linear.map((c) => toHex(srgbTransfer(c))).join('')}`
}

/**
 * The gradient for one player.
 *
 * `key` should be the player id — stable for the life of the account. A display
 * name works when that is all a row has, but it changes when they rename
 * themselves, and their colour changes with it.
 */
export function avatarIdentity(key: string): AvatarIdentity {
  const h = hashKey(key)

  /**
   * Three independently mixed draws rather than three slices of one number.
   * Slicing made spread and angle move in lockstep with the hue, which
   * collapsed the variety back down and — worse — left the angle constant
   * across the whole app. Re-mixing with distinct constants makes them
   * genuinely independent.
   */
  const hue = h % 360
  const spread =
    HUE_SPREAD_MIN + ((fmix32(h ^ 0x9e3779b9) % HUE_SPREAD_STEPS) * 48) / HUE_SPREAD_STEPS
  const angle = ((fmix32(h ^ 0x7f4a7c15) % ANGLE_STEPS) * 360) / ANGLE_STEPS

  const from = oklchToHex(STOP_LIGHT_L, STOP_C, hue)
  const to = oklchToHex(STOP_DARK_L, STOP_C, (hue + spread) % 360)

  return {
    from,
    to,
    angle,
    ink: '#FFFFFF',
    gradient: `linear-gradient(${angle}deg, ${from}, ${to})`
  }
}
