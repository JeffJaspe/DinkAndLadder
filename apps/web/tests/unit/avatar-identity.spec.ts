import { describe, expect, it } from 'vitest'
import { avatarIdentity, hashKey, oklchToHex } from '../../utils/avatar-identity'

/** WCAG relative luminance of a `#rrggbb` string. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05)
}

/** Hue in degrees, read back out of a generated hex. */
function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

/** How many 30° sectors of the wheel a set of keys lands in. */
function hueSectors(keys: string[]): number {
  const sectors = new Set<number>()
  for (const key of keys) sectors.add(Math.floor(hueOf(avatarIdentity(key).from) / 30))
  return sectors.size
}

describe('avatar-identity', () => {
  describe('the contrast floor', () => {
    /**
     * The load-bearing test. The whole reason the colour is generated in OKLCH
     * rather than HSL is that perceptual lightness holds across hue; if someone
     * retunes the constants toward something prettier, this fails rather than
     * shipping unreadable initials on a cyan avatar.
     */
    it('white initials clear AA on every hue, on both stops', () => {
      for (let hue = 0; hue < 360; hue++) {
        const light = oklchToHex(0.5, 0.16, hue)
        const dark = oklchToHex(0.42, 0.16, hue)
        expect(contrastWithWhite(light), `light stop at hue ${hue}`).toBeGreaterThanOrEqual(4.5)
        expect(contrastWithWhite(dark), `dark stop at hue ${hue}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('every generated identity clears AA on both of its own stops', () => {
      for (let i = 0; i < 2000; i++) {
        const identity = avatarIdentity(`player-${i}`)
        expect(contrastWithWhite(identity.from), identity.from).toBeGreaterThanOrEqual(4.5)
        expect(contrastWithWhite(identity.to), identity.to).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('the worst hue still has headroom, so a small retune is not a cliff', () => {
      let worst = Infinity
      for (let hue = 0; hue < 360; hue++) {
        worst = Math.min(worst, contrastWithWhite(oklchToHex(0.5, 0.16, hue)))
      }
      // ~4.98:1 at hue 192 (cyan). Recorded so a regression is visible as a
      // number rather than as a pass/fail flip.
      expect(worst).toBeGreaterThan(4.9)
    })
  })

  describe('determinism', () => {
    it('is stable for the same key', () => {
      const a = avatarIdentity('4f9a2c11-0000-4000-8000-000000000001')
      const b = avatarIdentity('4f9a2c11-0000-4000-8000-000000000001')
      expect(a).toEqual(b)
    })

    it('differs between keys', () => {
      const a = avatarIdentity('player-a')
      const b = avatarIdentity('player-b')
      expect(a.gradient).not.toBe(b.gradient)
    })

    it('hashes without overflowing to a float or going negative', () => {
      for (const key of ['', 'a', 'player-1', '4f9a2c11-0000-4000-8000-000000000001', '✨🏓']) {
        const h = hashKey(key)
        expect(Number.isInteger(h)).toBe(true)
        expect(h).toBeGreaterThanOrEqual(0)
        expect(h).toBeLessThanOrEqual(0xffffffff)
      }
    })
  })

  describe('uniqueness', () => {
    /**
     * The regression this file exists for.
     *
     * A club roster is the real case: if hashing clusters, half a roster lands
     * in the same corner of the wheel and the avatars stop telling anybody
     * apart, which is the entire point of generating them.
     *
     * Raw FNV-1a moved sequential keys by a fixed delta, and 2 × 16777619 mod
     * 360 is −2 — so player-0, player-2 and player-4 were two degrees apart and
     * a seeded roster came out as a column of the same olive. The first version
     * of this test bucketed by dominant channel and passed anyway, which is why
     * it now reads the hue back properly.
     */
    it('spreads SEQUENTIAL keys across the whole wheel', () => {
      const keys = Array.from({ length: 60 }, (_, i) => `player-${i}`)
      expect(hueSectors(keys)).toBeGreaterThanOrEqual(10)
    })

    it('spreads uuid-shaped keys across the whole wheel', () => {
      const keys = Array.from(
        { length: 200 },
        (_, i) => `4f9a2c11-0000-4000-8000-${String(i).padStart(12, '0')}`
      )
      expect(hueSectors(keys)).toBe(12)
    })

    it('never lands two adjacent keys on the same hue step', () => {
      // The exact shape of the old bug: a constant stride through the wheel.
      const strides = new Set<number>()
      for (let i = 0; i < 40; i++) {
        const a = hueOf(avatarIdentity(`player-${i}`).from)
        const b = hueOf(avatarIdentity(`player-${i + 1}`).from)
        strides.add(Math.round(((b - a + 360) % 360) / 10))
      }
      // A fixed stride would collapse this to one value.
      expect(strides.size).toBeGreaterThan(8)
    })

    it('produces mostly distinct gradients across a large roster', () => {
      const seen = new Set<string>()
      for (let i = 0; i < 1000; i++) seen.add(avatarIdentity(`player-${i}`).gradient)
      // Collisions are expected at some rate — 360 hues x 16 spreads x 8 angles
      // is finite — but a roster of 1000 should still look varied.
      expect(seen.size).toBeGreaterThan(900)
    })

    it('uses every gradient angle, even across sequential keys', () => {
      // Angle came off the high bits, which a one-character change barely
      // touched: every avatar in the app shared a single 315° sweep.
      const angles = new Set<number>()
      for (let i = 0; i < 60; i++) angles.add(avatarIdentity(`player-${i}`).angle)
      expect(angles.size).toBe(8)
    })

    it('varies the hue spread too, so gradients are not all the same sweep', () => {
      const spreads = new Set<string>()
      for (let i = 0; i < 60; i++) {
        const id = avatarIdentity(`player-${i}`)
        spreads.add(String(Math.round(hueOf(id.to) - hueOf(id.from))))
      }
      expect(spreads.size).toBeGreaterThan(4)
    })
  })

  describe('shape', () => {
    it('emits a usable css gradient and a white ink', () => {
      const identity = avatarIdentity('player-1')
      expect(identity.gradient).toMatch(/^linear-gradient\(\d+deg, #[0-9a-f]{6}, #[0-9a-f]{6}\)$/)
      expect(identity.ink).toBe('#FFFFFF')
      expect(identity.angle).toBeGreaterThanOrEqual(0)
      expect(identity.angle).toBeLessThan(360)
    })

    it('clamps out-of-gamut triples to a real colour', () => {
      // Very high chroma leaves sRGB at most hues; it must still come back as a
      // parseable hex rather than NaN.
      for (let hue = 0; hue < 360; hue += 30) {
        expect(oklchToHex(0.5, 0.4, hue)).toMatch(/^#[0-9a-f]{6}$/)
      }
    })
  })
})
