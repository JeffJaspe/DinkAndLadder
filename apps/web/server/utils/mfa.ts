import type { H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createUserRepository } from '~/server/domains/identity/repositories/user.repository'
import { createMfaRecoveryCodeRepository } from '~/server/domains/identity/repositories/mfa-recovery-code.repository'
import { createMfaService, type MfaOutcome } from '~/server/domains/identity/services/mfa.service'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import type { AssuranceLevel } from '~/server/domains/identity/dto/mfa.dto'
import { apiError } from './api-error'
import { getBranding } from './branding'

/**
 * One place that knows how the MFA service is wired for a request.
 *
 * Reads and writes of `users.mfa_enrolled_at` and the recovery codes go
 * through the service role: neither table has a user policy (062), and the
 * identity being acted on always comes from the verified session, never the
 * body. The factor operations themselves use the caller's own client, so
 * Supabase ties them to the session's user.
 */
export async function createMfaServiceFor(event: H3Event) {
  const admin = serverSupabaseServiceRole(event)
  const platformAdmin = createPlatformAdminService(createPlatformConfigRepository(admin))
  return {
    service: createMfaService({
      userRepo: createUserRepository(admin),
      recoveryRepo: createMfaRecoveryCodeRepository(admin),
      policy: { isRequiredFor: (userId) => platformAdmin.isSuperAdmin(userId) },
      // The name shown in the authenticator app next to the account.
      issuer: (await getBranding(event)).app_name
    }),
    userClient: await serverSupabaseClient(event),
    adminClient: admin
  }
}

/** The `aal` claim, defaulting to the weakest level for anything unexpected. */
export function assuranceLevelOf(claims: { aal?: unknown } | null): AssuranceLevel {
  return claims?.aal === 'aal2' ? 'aal2' : 'aal1'
}

/**
 * The step-up guard for actions that must never run on a password alone:
 * turning 2FA off, resetting someone else's, and - when they exist - setting
 * a payout account or approving a payout. Exported for those future endpoints
 * so the rule is written once.
 */
export function requireAal2(claims: { aal?: unknown } | null): void {
  if (assuranceLevelOf(claims) !== 'aal2') {
    throw apiError(
      403,
      'MFA_STEP_UP_REQUIRED',
      'Enter the code from your authenticator app to do this.'
    )
  }
}

/** Turns a service outcome into a response or the matching HTTP error. */
export function unwrapMfaOutcome<T>(outcome: MfaOutcome<T>, failureStatus = 400): T {
  if (outcome.ok) return outcome.value
  throw apiError(
    outcome.code === 'MFA_REQUIRED_ROLE' ? 409 : failureStatus,
    outcome.code,
    outcome.message
  )
}

/**
 * Per-user memo of `users.mfa_enrolled_at IS NOT NULL` for the API gate
 * (server/middleware/mfa-gate.ts). The gate runs on every `/api/v1` request
 * from a signed-in caller, and a PK read per request is cheap but not free.
 *
 * Thirty seconds, like feature-flags.ts - but unlike that cache this one IS
 * part of an authorization decision, so the writers (every MFA endpoint that
 * changes enrolment) clear the entry synchronously in this process. Across
 * instances the window means: for up to 30 s after enrolling, an aal1 session
 * on another instance may still pass. That session was legitimately signed
 * in with the password moments ago by the same person; it is not the threat.
 * The reverse (unenrolling) can only make the gate stricter than reality,
 * which fails safe.
 */
const TTL_MS = 30_000
const enrolledCache = new Map<string, { enrolled: boolean; expiresAt: number }>()

export function invalidateMfaEnrolledCache(userId: string): void {
  enrolledCache.delete(userId)
}

export async function isMfaEnrolled(event: H3Event, userId: string): Promise<boolean> {
  const hit = enrolledCache.get(userId)
  if (hit && hit.expiresAt > Date.now()) return hit.enrolled

  const repo = createUserRepository(serverSupabaseServiceRole(event))
  const user = await repo.findByAuthId(userId)
  const enrolled = (user?.mfa_enrolled_at ?? null) !== null
  enrolledCache.set(userId, { enrolled, expiresAt: Date.now() + TTL_MS })
  return enrolled
}
