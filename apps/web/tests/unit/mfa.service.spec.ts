import { beforeEach, describe, expect, it } from 'vitest'
import {
  createMfaService,
  type MfaAdminClient,
  type MfaRecoverAuthClient,
  type MfaService,
  type MfaUserClient
} from '../../server/domains/identity/services/mfa.service'
import type { UserRepository } from '../../server/domains/identity/repositories/user.repository'
import type { MfaRecoveryCodeRepository } from '../../server/domains/identity/repositories/mfa-recovery-code.repository'
import type { UserRecord } from '../../server/domains/identity/dto/user.dto'
import { hashRecoveryCode } from '~/utils/mfa-recovery'

/**
 * The service is exercised against an in-memory model of Supabase's factor
 * store, so every rule - a fresh code to turn it off, a required role cannot
 * turn it off, a recovery code works once - is asserted without a network.
 */

interface FakeFactor {
  id: string
  factor_type: string
  status: 'verified' | 'unverified'
  secret: string
}

const USER = 'user-1'
const GOOD_CODE = '123456'

function user(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: USER,
    email: 'p@example.com',
    status: 'active',
    email_verified_at: null,
    last_login_at: null,
    mfa_enrolled_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function fakeWorld() {
  const users = new Map<string, UserRecord>([[USER, user()]])
  const factors: FakeFactor[] = []
  const codes = new Map<string, { hash: string; used: boolean }[]>()
  let nextId = 1

  const userRepo: UserRepository = {
    async findByAuthId(id) {
      return users.get(id) ?? null
    },
    async findByEmail(email) {
      return [...users.values()].find((u) => u.email === email) ?? null
    },
    async upsertFromAuthIdentity() {
      throw new Error('not used')
    },
    async setMfaEnrolledAt(id, at) {
      const row = users.get(id)
      if (row) users.set(id, { ...row, mfa_enrolled_at: at })
    }
  }

  const recoveryRepo: MfaRecoveryCodeRepository = {
    async replaceForUser(id, hashes) {
      codes.set(
        id,
        hashes.map((hash) => ({ hash, used: false }))
      )
    },
    async consume(id, hash) {
      const row = (codes.get(id) ?? []).find((c) => c.hash === hash && !c.used)
      if (!row) return false
      row.used = true
      return true
    },
    async countUnused(id) {
      return (codes.get(id) ?? []).filter((c) => !c.used).length
    },
    async deleteForUser(id) {
      codes.delete(id)
    }
  }

  const userClient: MfaUserClient = {
    auth: {
      mfa: {
        async enroll() {
          const id = `factor-${nextId++}`
          factors.push({ id, factor_type: 'totp', status: 'unverified', secret: 'S' })
          return {
            data: { id, totp: { qr_code: 'data:image/svg+xml;utf8,<svg/>', secret: 'S', uri: 'otpauth://x' } },
            error: null
          }
        },
        async challenge({ factorId }) {
          return factors.some((f) => f.id === factorId)
            ? { data: { id: `challenge-${factorId}` }, error: null }
            : { data: null, error: { message: 'no such factor', code: 'mfa_factor_not_found' } }
        },
        async verify({ factorId, code }) {
          const factor = factors.find((f) => f.id === factorId)
          if (!factor || code !== GOOD_CODE) {
            return { data: null, error: { message: 'bad code', code: 'mfa_verification_failed' } }
          }
          factor.status = 'verified'
          return { data: {}, error: null }
        },
        async unenroll({ factorId }) {
          const i = factors.findIndex((f) => f.id === factorId)
          if (i >= 0) factors.splice(i, 1)
          return { data: {}, error: null }
        },
        async listFactors() {
          return { data: { all: factors.map((f) => ({ ...f })) }, error: null }
        }
      }
    }
  }

  const admin: MfaAdminClient = {
    auth: {
      admin: {
        mfa: {
          async listFactors() {
            return { data: { factors: factors.map((f) => ({ ...f })) }, error: null }
          },
          async deleteFactor({ id }) {
            const i = factors.findIndex((f) => f.id === id)
            if (i >= 0) factors.splice(i, 1)
            return { data: {}, error: null }
          }
        }
      }
    }
  }

  let signedOut = 0
  const recoverAuth: MfaRecoverAuthClient = {
    auth: {
      async signInWithPassword({ email, password }) {
        if (email === 'p@example.com' && password === 'correct') {
          return {
            data: { session: { access_token: 'a', refresh_token: 'r', user: { id: USER } } },
            error: null
          }
        }
        return { data: { session: null }, error: { message: 'nope', code: 'invalid_credentials' } }
      },
      async signOut() {
        signedOut++
        return { error: null }
      }
    }
  }

  let required = false
  const service = createMfaService({
    userRepo,
    recoveryRepo,
    policy: { isRequiredFor: async () => required },
    issuer: 'DinkAndLadder',
    now: () => new Date('2026-09-15T00:00:00Z')
  })

  return {
    service,
    users,
    factors,
    userClient,
    admin,
    recoverAuth,
    setRequired(v: boolean) {
      required = v
    },
    signedOutCount: () => signedOut
  }
}

/** What the browser does between the two server calls: pass the code. */
async function passCodeInBrowser(client: MfaUserClient, factorId: string, code: string) {
  const { data } = await client.auth.mfa.challenge({ factorId })
  if (!data) throw new Error('challenge failed')
  return client.auth.mfa.verify({ factorId, challengeId: data.id, code })
}

async function enrol(service: MfaService, client: MfaUserClient) {
  const start = await service.startEnrollment(client)
  if (!start.ok) throw new Error('start failed')
  await passCodeInBrowser(client, start.value.factor_id, GOOD_CODE)
  const done = await service.confirmEnrollment(client, USER)
  if (!done.ok) throw new Error('confirm failed')
  return done.value.recovery_codes
}

describe('MfaService', () => {
  let world: ReturnType<typeof fakeWorld>

  beforeEach(() => {
    world = fakeWorld()
  })

  describe('status', () => {
    it('reports an unenrolled account with no codes', async () => {
      expect(await world.service.status(USER, 'aal1')).toEqual({
        enrolled: false,
        enrolled_at: null,
        aal: 'aal1',
        required: false,
        recovery_codes_remaining: 0
      })
    })

    it('reports enrolment, the session level and the policy', async () => {
      await enrol(world.service, world.userClient)
      world.setRequired(true)
      const status = await world.service.status(USER, 'aal2')
      expect(status.enrolled).toBe(true)
      expect(status.enrolled_at).toBe('2026-09-15T00:00:00.000Z')
      expect(status.aal).toBe('aal2')
      expect(status.required).toBe(true)
      expect(status.recovery_codes_remaining).toBe(8)
    })
  })

  describe('enrolment', () => {
    it('returns the QR, secret and factor id', async () => {
      const start = await world.service.startEnrollment(world.userClient)
      expect(start.ok).toBe(true)
      if (start.ok) {
        expect(start.value.factor_id).toBe('factor-1')
        expect(start.value.secret).toBe('S')
        expect(start.value.qr_code).toMatch(/^data:image\/svg\+xml/)
      }
    })

    it('discards an abandoned unverified factor before starting again', async () => {
      await world.service.startEnrollment(world.userClient)
      await world.service.startEnrollment(world.userClient)
      expect(world.factors).toHaveLength(1)
      expect(world.factors[0].id).toBe('factor-2')
    })

    it('does not touch a verified factor when starting another enrolment', async () => {
      await enrol(world.service, world.userClient)
      await world.service.startEnrollment(world.userClient)
      expect(world.factors.map((f) => f.status)).toEqual(['verified', 'unverified'])
    })

    it('confirming before the code passed leaves the account unenrolled with no codes', async () => {
      const start = await world.service.startEnrollment(world.userClient)
      if (!start.ok) throw new Error()
      await passCodeInBrowser(world.userClient, start.value.factor_id, '000000')
      const result = await world.service.confirmEnrollment(world.userClient, USER)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe('MFA_NOT_VERIFIED')
      expect(world.users.get(USER)?.mfa_enrolled_at).toBeNull()
      expect((await world.service.status(USER, 'aal1')).recovery_codes_remaining).toBe(0)
    })

    it('a verified factor sets the flag and returns eight distinct codes once', async () => {
      const codes = await enrol(world.service, world.userClient)
      expect(codes).toHaveLength(8)
      expect(new Set(codes).size).toBe(8)
      expect(world.users.get(USER)?.mfa_enrolled_at).toBe('2026-09-15T00:00:00.000Z')
      expect(world.factors[0].status).toBe('verified')
    })

    it('confirming twice replaces the codes rather than adding to them', async () => {
      const first = await enrol(world.service, world.userClient)
      const second = await world.service.confirmEnrollment(world.userClient, USER)
      expect(second.ok).toBe(true)
      expect((await world.service.status(USER, 'aal2')).recovery_codes_remaining).toBe(8)
      // The first set is dead: it hashes to rows that no longer exist.
      const stale = await world.service.recover(
        world.recoverAuth,
        world.admin,
        'p@example.com',
        'correct',
        first[0]
      )
      expect(stale.ok).toBe(false)
    })
  })

  describe('unenroll', () => {
    it('is refused for an account the policy requires 2FA on', async () => {
      await enrol(world.service, world.userClient)
      world.setRequired(true)
      const result = await world.service.unenroll(world.userClient, USER, GOOD_CODE)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe('MFA_REQUIRED_ROLE')
      expect(world.factors).toHaveLength(1)
    })

    it('needs a correct fresh code', async () => {
      await enrol(world.service, world.userClient)
      const result = await world.service.unenroll(world.userClient, USER, '000000')
      expect(result.ok).toBe(false)
      expect(world.factors).toHaveLength(1)
      expect(world.users.get(USER)?.mfa_enrolled_at).not.toBeNull()
    })

    it('removes the factor, the codes and the flag', async () => {
      await enrol(world.service, world.userClient)
      const result = await world.service.unenroll(world.userClient, USER, GOOD_CODE)
      expect(result.ok).toBe(true)
      expect(world.factors).toHaveLength(0)
      expect(world.users.get(USER)?.mfa_enrolled_at).toBeNull()
      expect((await world.service.status(USER, 'aal1')).recovery_codes_remaining).toBe(0)
    })

    it('is a no-op that clears a stale flag when no factor exists', async () => {
      world.users.set(USER, user({ mfa_enrolled_at: '2026-01-01T00:00:00Z' }))
      const result = await world.service.unenroll(world.userClient, USER, 'whatever')
      expect(result.ok).toBe(true)
      expect(world.users.get(USER)?.mfa_enrolled_at).toBeNull()
    })
  })

  describe('recover', () => {
    const FAIL = { ok: false, code: 'INVALID_RECOVERY' }

    it('wrong password fails with the generic outcome', async () => {
      await enrol(world.service, world.userClient)
      const result = await world.service.recover(
        world.recoverAuth,
        world.admin,
        'p@example.com',
        'wrong',
        'ABCD-EFGH'
      )
      expect(result).toMatchObject(FAIL)
      expect(world.factors).toHaveLength(1)
    })

    it('wrong code fails with the same outcome and signs the probe session out', async () => {
      await enrol(world.service, world.userClient)
      const result = await world.service.recover(
        world.recoverAuth,
        world.admin,
        'p@example.com',
        'correct',
        'ABCD-EFGH'
      )
      expect(result).toMatchObject(FAIL)
      expect(world.signedOutCount()).toBe(1)
      expect(world.factors).toHaveLength(1)
    })

    it('a malformed code fails before the password is even checked', async () => {
      const result = await world.service.recover(
        world.recoverAuth,
        world.admin,
        'p@example.com',
        'correct',
        'nope'
      )
      expect(result).toMatchObject(FAIL)
      expect(world.signedOutCount()).toBe(0)
    })

    it('a valid code removes every factor, clears the flag and returns a session', async () => {
      const codes = await enrol(world.service, world.userClient)
      const result = await world.service.recover(
        world.recoverAuth,
        world.admin,
        'p@example.com',
        'correct',
        codes[0].toLowerCase()
      )
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.session?.access_token).toBe('a')
      expect(world.factors).toHaveLength(0)
      expect(world.users.get(USER)?.mfa_enrolled_at).toBeNull()
    })

    it('a code works exactly once', async () => {
      const codes = await enrol(world.service, world.userClient)
      await world.service.recover(world.recoverAuth, world.admin, 'p@example.com', 'correct', codes[0])
      // Re-enrol so there is something to recover from, but do not mint new codes:
      // the old code must be gone regardless.
      const start = await world.service.startEnrollment(world.userClient)
      if (!start.ok) throw new Error()
      world.factors[0].status = 'verified'
      const again = await world.service.recover(
        world.recoverAuth,
        world.admin,
        'p@example.com',
        'correct',
        codes[0]
      )
      expect(again).toMatchObject(FAIL)
    })
  })

  describe('adminReset', () => {
    it('removes factors, codes and flag without any credential', async () => {
      await enrol(world.service, world.userClient)
      await world.service.adminReset(world.admin, USER)
      expect(world.factors).toHaveLength(0)
      expect(world.users.get(USER)?.mfa_enrolled_at).toBeNull()
      expect((await world.service.status(USER, 'aal1')).recovery_codes_remaining).toBe(0)
    })
  })

  describe('syncEnrolledFlag', () => {
    it('sets the flag when Supabase has a verified factor we did not record', async () => {
      world.factors.push({ id: 'mobile', factor_type: 'totp', status: 'verified', secret: 'S' })
      expect(await world.service.syncEnrolledFlag(world.userClient, USER)).toBe(true)
      expect(world.users.get(USER)?.mfa_enrolled_at).toBe('2026-09-15T00:00:00.000Z')
    })

    it('clears the flag when Supabase has no verified factor', async () => {
      world.users.set(USER, user({ mfa_enrolled_at: '2026-01-01T00:00:00Z' }))
      expect(await world.service.syncEnrolledFlag(world.userClient, USER)).toBe(false)
      expect(world.users.get(USER)?.mfa_enrolled_at).toBeNull()
    })

    it('ignores an unverified factor', async () => {
      world.factors.push({ id: 'half', factor_type: 'totp', status: 'unverified', secret: 'S' })
      expect(await world.service.syncEnrolledFlag(world.userClient, USER)).toBe(false)
      expect(world.users.get(USER)?.mfa_enrolled_at).toBeNull()
    })

    it('does not rewrite an already-correct flag', async () => {
      const enrolledAt = '2026-01-01T00:00:00Z'
      world.users.set(USER, user({ mfa_enrolled_at: enrolledAt }))
      world.factors.push({ id: 'f', factor_type: 'totp', status: 'verified', secret: 'S' })
      await world.service.syncEnrolledFlag(world.userClient, USER)
      expect(world.users.get(USER)?.mfa_enrolled_at).toBe(enrolledAt)
    })
  })

  it('recovery hashes are bound to the user', async () => {
    const codes = await enrol(world.service, world.userClient)
    const hash = await hashRecoveryCode(codes[0], 'someone-else')
    // Using another user's id yields a hash that consumes nothing.
    expect(await world.service.status(USER, 'aal1')).toMatchObject({ recovery_codes_remaining: 8 })
    expect(hash).not.toBe(await hashRecoveryCode(codes[0], USER))
  })
})
