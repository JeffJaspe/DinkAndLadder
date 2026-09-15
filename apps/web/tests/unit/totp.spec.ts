import { describe, expect, it } from 'vitest'
import { base32Decode, hotp, totp, totpStep } from '../e2e/helpers/totp'

/**
 * The e2e suite plays the authenticator app with this. If it drifts from the
 * RFC, every MFA journey fails in a way that looks like a product bug, so it
 * is pinned to the published vectors.
 */

// RFC 4226 appendix D: secret "12345678901234567890", counters 0-9.
const RFC4226_SECRET = Buffer.from('12345678901234567890', 'ascii')
const RFC4226 = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489']

describe('hotp', () => {
  it('matches the RFC 4226 test vectors', () => {
    RFC4226.forEach((expected, counter) => {
      expect(hotp(RFC4226_SECRET, counter)).toBe(expected)
    })
  })
})

describe('totp', () => {
  // RFC 6238 appendix B, SHA-1 rows, 8 digits. The secret is the ASCII
  // "12345678901234567890", which base32-encodes to the string below.
  const SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

  it('decodes base32 back to the RFC secret', () => {
    expect(base32Decode(SECRET_B32).toString('ascii')).toBe('12345678901234567890')
  })

  it.each([
    [59_000, '94287082'],
    [1_111_111_109_000, '07081804'],
    [1_111_111_111_000, '14050471'],
    [1_234_567_890_000, '89005924'],
    [2_000_000_000_000, '69279037']
  ])('at %i ms yields %s', (ms, expected) => {
    expect(totp(SECRET_B32, ms, 8)).toBe(expected)
  })

  it('uses 30-second steps', () => {
    expect(totpStep(59_000)).toBe(1)
    expect(totpStep(60_000)).toBe(2)
  })

  it('is six digits by default', () => {
    expect(totp(SECRET_B32, 59_000)).toMatch(/^\d{6}$/)
  })
})
