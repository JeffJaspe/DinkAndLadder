import type { UserRepository } from '../repositories/user.repository'
import type { MfaRecoveryCodeRepository } from '../repositories/mfa-recovery-code.repository'
import type {
  AssuranceLevel,
  MfaEnrollResponseDto,
  MfaRecoverResponseDto,
  MfaStatusDto,
  MfaVerifyEnrollmentResponseDto
} from '../dto/mfa.dto'
import type { AuthSession, PasswordAuthError } from './auth.service'
import { generateRecoveryCodes, hashRecoveryCode, normaliseRecoveryCode } from '~/utils/mfa-recovery'

/**
 * Two-factor authentication on top of Supabase Auth's TOTP factors.
 *
 * Supabase does the cryptography - enrolment secret, QR, code verification,
 * and the `aal` claim that says whether a session presented the factor. This
 * service adds the three things it does not do: keep `users.mfa_enrolled_at`
 * in step so the API gate can read it cheaply, issue and consume recovery
 * codes, and apply the policy of who must have 2FA.
 *
 * Every result is a discriminated outcome rather than a thrown error, so the
 * controllers map outcomes to status codes and this file never imports h3.
 */

export type MfaError = PasswordAuthError

interface FactorLike {
  id: string
  factor_type: string
  status: 'verified' | 'unverified' | string
}

/**
 * The caller's own session client. Enrol/verify/unenroll run *as the user*:
 * Supabase ties the factor to the session's user and refuses anything else,
 * which is exactly the authorization these operations need.
 */
export interface MfaUserClient {
  auth: {
    mfa: {
      enroll(params: { factorType: 'totp'; friendlyName?: string; issuer?: string }): Promise<{
        data: { id: string; totp: { qr_code: string; secret: string; uri: string } } | null
        error: MfaError | null
      }>
      challenge(params: { factorId: string }): Promise<{
        data: { id: string } | null
        error: MfaError | null
      }>
      verify(params: {
        factorId: string
        challengeId: string
        code: string
      }): Promise<{ data: unknown; error: MfaError | null }>
      unenroll(params: { factorId: string }): Promise<{ data: unknown; error: MfaError | null }>
      listFactors(): Promise<{ data: { all: FactorLike[] } | null; error: MfaError | null }>
    }
  }
}

/**
 * Service role. Deleting another person's factor (recovery, admin reset) is
 * the one MFA operation that cannot run as the user, because the user cannot
 * present the factor - that is the whole reason they are here.
 */
export interface MfaAdminClient {
  auth: {
    admin: {
      mfa: {
        listFactors(params: { userId: string }): Promise<{
          data: { factors: FactorLike[] } | null
          error: MfaError | null
        }>
        deleteFactor(params: { id: string; userId: string }): Promise<{
          data: unknown
          error: MfaError | null
        }>
      }
    }
  }
}

/** For `recover`, which has no session yet and must check the password first. */
export interface MfaRecoverAuthClient {
  auth: {
    signInWithPassword(params: { email: string; password: string }): Promise<{
      data: { session: (AuthSession & { user: { id: string } }) | null } | null
      error: MfaError | null
    }>
    signOut(options?: { scope: 'local' }): Promise<{ error: MfaError | null }>
  }
}

export interface MfaPolicy {
  /** Who must have 2FA. SuperAdmin today; club owners taking payments later. */
  isRequiredFor(userId: string): Promise<boolean>
}

export type MfaOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; provider?: MfaError }

const TOTP_FRIENDLY_NAME = 'Authenticator app'

export interface MfaServiceDeps {
  userRepo: UserRepository
  recoveryRepo: MfaRecoveryCodeRepository
  policy: MfaPolicy
  /** Shown in the authenticator app next to the account. */
  issuer: string
  now?: () => Date
}

export function createMfaService(deps: MfaServiceDeps) {
  const now = deps.now ?? (() => new Date())

  async function verifiedTotpFactors(client: MfaUserClient): Promise<FactorLike[]> {
    const { data, error } = await client.auth.mfa.listFactors()
    if (error) throw error
    return (data?.all ?? []).filter((f) => f.factor_type === 'totp' && f.status === 'verified')
  }

  async function deleteAllFactors(admin: MfaAdminClient, userId: string): Promise<void> {
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId })
    if (error) throw error
    for (const factor of data?.factors ?? []) {
      const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId
      })
      if (deleteError) throw deleteError
    }
  }

  async function clearEnrolment(userId: string): Promise<void> {
    await deps.recoveryRepo.deleteForUser(userId)
    await deps.userRepo.setMfaEnrolledAt(userId, null)
  }

  return {
    async status(userId: string, aal: AssuranceLevel): Promise<MfaStatusDto> {
      const [user, required, remaining] = await Promise.all([
        deps.userRepo.findByAuthId(userId),
        deps.policy.isRequiredFor(userId),
        deps.recoveryRepo.countUnused(userId)
      ])
      const enrolledAt = user?.mfa_enrolled_at ?? null
      return {
        enrolled: enrolledAt !== null,
        enrolled_at: enrolledAt,
        aal,
        required,
        recovery_codes_remaining: enrolledAt !== null ? remaining : 0
      }
    },

    /**
     * Starts the wizard. An abandoned attempt leaves an unverified factor
     * behind, and Supabase caps how many a user may hold, so any unverified
     * TOTP factor is removed first: the person is starting over, not adding.
     */
    async startEnrollment(client: MfaUserClient): Promise<MfaOutcome<MfaEnrollResponseDto>> {
      const { data: listed, error: listError } = await client.auth.mfa.listFactors()
      if (listError) return providerFailure('MFA_ENROLL_FAILED', listError)
      for (const stale of (listed?.all ?? []).filter(
        (f) => f.factor_type === 'totp' && f.status !== 'verified'
      )) {
        const { error } = await client.auth.mfa.unenroll({ factorId: stale.id })
        if (error) return providerFailure('MFA_ENROLL_FAILED', error)
      }

      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: TOTP_FRIENDLY_NAME,
        issuer: deps.issuer
      })
      if (error || !data) {
        return providerFailure('MFA_ENROLL_FAILED', error ?? undefined)
      }
      return {
        ok: true,
        value: {
          factor_id: data.id,
          qr_code: data.totp.qr_code,
          secret: data.totp.secret,
          uri: data.totp.uri
        }
      }
    },

    /**
     * Step two of the wizard, after the browser has passed the code.
     *
     * The verify call itself runs in the browser, not here: it is what raises
     * the session to aal2, and the session lives in the browser's cookies. The
     * server does not take the browser's word for it - it asks Supabase
     * whether a verified TOTP factor now exists (and the controller requires
     * the aal2 claim on top). Only then does the account count as enrolled,
     * and only then are recovery codes minted - someone who never finished
     * the wizard has nothing to recover from.
     */
    async confirmEnrollment(
      client: MfaUserClient,
      userId: string
    ): Promise<MfaOutcome<MfaVerifyEnrollmentResponseDto>> {
      const verified = await verifiedTotpFactors(client)
      if (verified.length === 0) {
        return {
          ok: false,
          code: 'MFA_NOT_VERIFIED',
          message: 'Enter the code from your authenticator app first.'
        }
      }

      const codes = generateRecoveryCodes()
      const hashes = await Promise.all(codes.map((c) => hashRecoveryCode(c, userId)))
      await deps.recoveryRepo.replaceForUser(userId, hashes)
      await deps.userRepo.setMfaEnrolledAt(userId, now().toISOString())

      return { ok: true, value: { recovery_codes: codes } }
    },

    /**
     * Turning it off is the action a thief wants most, so it costs the most:
     * an aal2 session (checked by the controller) *and* a fresh code, and it
     * is refused outright for accounts the policy says must have it.
     */
    async unenroll(
      client: MfaUserClient,
      userId: string,
      code: string
    ): Promise<MfaOutcome<void>> {
      if (await deps.policy.isRequiredFor(userId)) {
        return {
          ok: false,
          code: 'MFA_REQUIRED_ROLE',
          message: 'Two-factor authentication is required for this account and cannot be turned off.'
        }
      }

      const factors = await verifiedTotpFactors(client)
      if (factors.length === 0) {
        // Nothing to remove; make sure our flag agrees.
        await clearEnrolment(userId)
        return { ok: true, value: undefined }
      }

      const [primary] = factors
      const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
        factorId: primary.id
      })
      if (challengeError || !challenge) {
        return providerFailure('MFA_VERIFY_FAILED', challengeError ?? undefined)
      }
      const { error: verifyError } = await client.auth.mfa.verify({
        factorId: primary.id,
        challengeId: challenge.id,
        code: code.trim()
      })
      if (verifyError) return providerFailure('MFA_VERIFY_FAILED', verifyError)

      for (const factor of factors) {
        const { error } = await client.auth.mfa.unenroll({ factorId: factor.id })
        if (error) return providerFailure('MFA_UNENROLL_FAILED', error)
      }
      await clearEnrolment(userId)
      return { ok: true, value: undefined }
    },

    /**
     * Lost device. Password + one unused recovery code removes every factor so
     * the owner can sign in and enrol again. Every failure - wrong password,
     * wrong code, spent code, unknown email - is the same 401 with the same
     * words, so the endpoint answers nothing about which part was right.
     */
    async recover(
      authClient: MfaRecoverAuthClient,
      admin: MfaAdminClient,
      email: string,
      password: string,
      recoveryCode: string
    ): Promise<MfaOutcome<MfaRecoverResponseDto & { user_id: string }>> {
      const failure: MfaOutcome<never> = {
        ok: false,
        code: 'INVALID_RECOVERY',
        message: 'Incorrect email, password or recovery code.'
      }

      const normalised = normaliseRecoveryCode(recoveryCode)
      if (!normalised) return failure

      const { data, error } = await authClient.auth.signInWithPassword({ email, password })
      const session = data?.session ?? null
      if (error || !session) return failure

      const userId = session.user.id
      const consumed = await deps.recoveryRepo.consume(
        userId,
        await hashRecoveryCode(normalised, userId)
      )
      if (!consumed) {
        // The password check above may have written aal1 cookies; an enrolled
        // account cannot use them past the gate, but leave nothing behind.
        await authClient.auth.signOut({ scope: 'local' })
        return failure
      }

      await deleteAllFactors(admin, userId)
      await clearEnrolment(userId)

      return {
        ok: true,
        value: {
          user_id: userId,
          session: { access_token: session.access_token, refresh_token: session.refresh_token }
        }
      }
    },

    /** SuperAdmin removing someone's factors by hand. Authorization is the controller's. */
    async adminReset(admin: MfaAdminClient, targetUserId: string): Promise<void> {
      await deleteAllFactors(admin, targetUserId)
      await clearEnrolment(targetUserId)
    },

    /**
     * Brings `users.mfa_enrolled_at` into line with what Supabase holds. Run at
     * every sign-in so a factor enrolled from the mobile client - which talks
     * to Supabase directly - is enforced from the next login on. Only writes
     * when the two disagree.
     */
    async syncEnrolledFlag(client: MfaUserClient, userId: string): Promise<boolean> {
      const enrolled = (await verifiedTotpFactors(client)).length > 0
      const user = await deps.userRepo.findByAuthId(userId)
      const flagged = (user?.mfa_enrolled_at ?? null) !== null
      if (enrolled && !flagged) {
        await deps.userRepo.setMfaEnrolledAt(userId, now().toISOString())
      } else if (!enrolled && flagged) {
        await clearEnrolment(userId)
      }
      return enrolled
    }
  }
}

export type MfaService = ReturnType<typeof createMfaService>

function providerFailure(code: string, provider?: MfaError): MfaOutcome<never> {
  return {
    ok: false,
    code,
    message: PROVIDER_MESSAGES[code] ?? 'Something went wrong. Please try again.',
    provider
  }
}

const PROVIDER_MESSAGES: Record<string, string> = {
  MFA_ENROLL_FAILED: 'Could not start two-factor setup. Please try again.',
  MFA_VERIFY_FAILED: 'That code is not right. Check your authenticator app and try again.',
  MFA_UNENROLL_FAILED: 'Could not turn off two-factor authentication. Please try again.'
}
