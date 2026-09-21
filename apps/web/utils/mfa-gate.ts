/**
 * Whether a request may proceed given what its session has proven.
 *
 * The decision is pure so every combination is a unit test; the h3 half
 * (server/middleware/mfa-gate.ts) only gathers the inputs and turns a verdict
 * into a 403.
 *
 * Two rules:
 *
 *  1. An account that has enrolled a second factor must present it. An `aal1`
 *     session on an enrolled account is a browser that knows the password and
 *     nothing more — exactly the case 2FA exists for — so it may reach only the
 *     routes needed to finish signing in.
 *  2. The SuperAdmin console requires `aal2` regardless. It approves payouts
 *     and resets other people's 2FA; there is no reading of "mandatory" under
 *     which it may run on a password alone.
 */

export type GateVerdict =
  | { allow: true }
  | { allow: false; code: 'MFA_REQUIRED' | 'MFA_STEP_UP_REQUIRED'; message: string }

export interface GateInput {
  /** Request path, no query string. */
  path: string
  /** Null when the request carries no usable session. */
  aal: 'aal1' | 'aal2' | null
  /** `users.mfa_enrolled_at IS NOT NULL` for the caller; false when signed out. */
  enrolled: boolean
}

/**
 * Where an `aal1` session on an enrolled account may still go: everything it
 * takes to present the second factor, use a recovery code, or sign out.
 * `/me/is-superadmin` is here because the admin route guard asks it before
 * anything else and must be able to say "go enrol" rather than crash.
 * `/platform/branding` is here because the MFA page renders the brand logo.
 */
const ALLOW_WHILE_PENDING = [
  '/api/v1/auth/',
  '/api/v1/mfa/',
  '/api/v1/me/is-superadmin',
  '/api/v1/platform/branding'
]

const ADMIN_PREFIX = '/api/v1/admin/'

export function isGatedPath(path: string): boolean {
  return path.startsWith('/api/v1/')
}

export function decideMfaGate({ path, aal, enrolled }: GateInput): GateVerdict {
  if (!isGatedPath(path)) return { allow: true }
  // Signed-out callers are the endpoint's own business (401 or public view).
  if (aal === null) return { allow: true }

  if (path.startsWith(ADMIN_PREFIX) && aal !== 'aal2') {
    return {
      allow: false,
      code: 'MFA_STEP_UP_REQUIRED',
      message: 'The admin console requires two-factor authentication.'
    }
  }

  if (enrolled && aal === 'aal1' && !ALLOW_WHILE_PENDING.some((p) => path.startsWith(p))) {
    return {
      allow: false,
      code: 'MFA_REQUIRED',
      message: 'Enter the code from your authenticator app to continue.'
    }
  }

  return { allow: true }
}
