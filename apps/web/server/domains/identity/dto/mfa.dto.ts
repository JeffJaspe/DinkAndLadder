/**
 * Two-factor authentication contracts.
 *
 * Supabase Auth owns the factor (`auth.mfa_factors`) and the assurance level
 * on the session JWT: `aal1` is password (or Google) only, `aal2` means the
 * second factor was also presented. These DTOs describe what the app adds on
 * top - enrolment state, the recovery codes Supabase does not provide, and the
 * policy of who must have it.
 */

export type AssuranceLevel = 'aal1' | 'aal2'

export interface MfaStatusDto {
  /** At least one verified TOTP factor exists. */
  enrolled: boolean
  enrolled_at: string | null
  /** What the *current* session has proven. */
  aal: AssuranceLevel
  /**
   * Policy, not state: this account is one that must have 2FA (SuperAdmin
   * today; club owners taking online payments later). A required account
   * cannot turn it off, and is steered into the wizard if it is not enrolled.
   */
  required: boolean
  recovery_codes_remaining: number
}

export interface MfaEnrollResponseDto {
  factor_id: string
  /** An SVG data URI, ready for an <img>. */
  qr_code: string
  /** For people who cannot scan; entered by hand into the app. */
  secret: string
  /** The otpauth:// URI the QR encodes. */
  uri: string
}

/**
 * Step two carries no body. The browser verifies the code against Supabase
 * directly (that is what upgrades its session to aal2); the server then
 * confirms enrolment from Supabase's own factor list, never from the client.
 */
export interface MfaVerifyEnrollmentResponseDto {
  /**
   * Shown exactly once. The server keeps hashes; there is no endpoint that
   * returns these again, only one that replaces them.
   */
  recovery_codes: string[]
}

export interface MfaUnenrollRequestDto {
  /** A fresh code from the app - an aal2 session alone is not enough. */
  code: string
}

export interface MfaRecoverRequestDto {
  email: string
  password: string
  recovery_code: string
  turnstile_token?: string
}

export interface MfaRecoverResponseDto {
  /** aal1 session tokens; the client calls setSession and re-enrols. */
  session: { access_token: string; refresh_token: string } | null
}
