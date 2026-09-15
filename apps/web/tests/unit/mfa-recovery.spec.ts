import { describe, expect, it } from 'vitest'
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  normaliseRecoveryCode
} from '~/utils/mfa-recovery'

const SHAPE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/

describe('generateRecoveryCode', () => {
  it('is two groups of four from the ambiguity-free alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRecoveryCode()).toMatch(SHAPE)
    }
  })

  it('never contains 0, O, 1 or I', () => {
    const all = Array.from({ length: 500 }, generateRecoveryCode).join('')
    expect(all).not.toMatch(/[01OI]/)
  })
})

describe('generateRecoveryCodes', () => {
  it('returns eight distinct codes by default', () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT)
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT)
  })

  it('honours a custom count', () => {
    expect(generateRecoveryCodes(3)).toHaveLength(3)
  })
})

describe('normaliseRecoveryCode', () => {
  it('accepts the canonical form unchanged', () => {
    expect(normaliseRecoveryCode('ABCD-EFGH')).toBe('ABCD-EFGH')
  })

  it('upper-cases, strips spaces and dashes, and re-inserts the dash', () => {
    expect(normaliseRecoveryCode('abcd efgh')).toBe('ABCD-EFGH')
    expect(normaliseRecoveryCode('abcdefgh')).toBe('ABCD-EFGH')
    expect(normaliseRecoveryCode(' ab-cd-ef-gh ')).toBe('ABCD-EFGH')
  })

  it('rejects the wrong length', () => {
    expect(normaliseRecoveryCode('ABC-DEFG')).toBeNull()
    expect(normaliseRecoveryCode('ABCDE-FGHJ')).toBeNull()
    expect(normaliseRecoveryCode('')).toBeNull()
  })

  it('rejects characters outside the alphabet, since none were ever issued', () => {
    expect(normaliseRecoveryCode('ABCD-EFG0')).toBeNull()
    expect(normaliseRecoveryCode('ABCD-EFGI')).toBeNull()
    expect(normaliseRecoveryCode('ABCD-EFG1')).toBeNull()
  })

  it('round-trips every generated code', () => {
    for (const code of generateRecoveryCodes(50)) {
      expect(normaliseRecoveryCode(code.toLowerCase())).toBe(code)
    }
  })
})

describe('hashRecoveryCode', () => {
  it('is deterministic for the same code and user', async () => {
    const a = await hashRecoveryCode('ABCD-EFGH', 'user-1')
    const b = await hashRecoveryCode('ABCD-EFGH', 'user-1')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('differs across users for the same code', async () => {
    const a = await hashRecoveryCode('ABCD-EFGH', 'user-1')
    const b = await hashRecoveryCode('ABCD-EFGH', 'user-2')
    expect(a).not.toBe(b)
  })

  it('differs across codes for the same user', async () => {
    const a = await hashRecoveryCode('ABCD-EFGH', 'user-1')
    const b = await hashRecoveryCode('ABCD-EFGJ', 'user-1')
    expect(a).not.toBe(b)
  })
})
