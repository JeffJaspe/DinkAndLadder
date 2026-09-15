import { createHmac } from 'node:crypto'

/**
 * RFC 6238 TOTP, the way an authenticator app computes it, so the e2e suite
 * can play the phone. SHA-1, 30-second steps, 6 digits - the defaults every
 * app and Supabase agree on. Pure, so it is unit-tested against the RFC's
 * own vectors (tests/unit/totp.spec.ts).
 */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', secret).update(msg).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return String(code % 10 ** digits).padStart(digits, '0')
}

export const TOTP_STEP_SECONDS = 30

export function totpStep(nowMs = Date.now(), step = TOTP_STEP_SECONDS): number {
  return Math.floor(nowMs / 1000 / step)
}

export function totp(base32Secret: string, nowMs = Date.now(), digits = 6): string {
  return hotp(base32Decode(base32Secret), totpStep(nowMs), digits)
}

/**
 * A code the server has not seen yet. Verifiers may refuse a code replayed
 * within the same 30-second step, so a second use in one test waits for the
 * step to roll over. Also avoids the last two seconds of a step, where a
 * code minted here can expire in flight.
 */
export function createTotpSource(base32Secret: string) {
  let lastStep = -1
  return {
    async next(): Promise<string> {
      for (;;) {
        const now = Date.now()
        const step = totpStep(now)
        const secondsLeft = TOTP_STEP_SECONDS - ((now / 1000) % TOTP_STEP_SECONDS)
        if (step !== lastStep && secondsLeft > 2) {
          lastStep = step
          return totp(base32Secret, now)
        }
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }
}
