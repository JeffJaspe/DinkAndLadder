export interface MappedAuthError {
  code: string
  message: string
}

/**
 * Maps Supabase Auth's stable machine-readable error codes (AuthError.code —
 * see @supabase/auth-js's ErrorCode union) to app-level codes and
 * user-facing copy. Deliberately keyed on `code`, not the raw message text,
 * since Supabase's message wording isn't a stable contract and has changed
 * across versions; the code is.
 */
/**
 * Shared so the two routes into this outcome say the same thing. Supabase
 * reports an existing address either as an error code (confirmations off) or,
 * with confirmations on, as a silent decoy signup that registerWithPassword
 * detects — see auth.service.ts. The copy names Google explicitly because the
 * decoy carries no provider information, and an account created through
 * "Continue with Google" has no password to log in with yet.
 */
export const EMAIL_ALREADY_REGISTERED: MappedAuthError = {
  code: 'EMAIL_ALREADY_REGISTERED',
  message:
    'That email already has an account. Send yourself a reset link to set a password — or log in, or use "Continue with Google" if that is how you signed up.'
}

const AUTH_ERROR_MESSAGES: Record<string, MappedAuthError> = {
  user_already_exists: EMAIL_ALREADY_REGISTERED,
  email_exists: EMAIL_ALREADY_REGISTERED,
  reauthentication_needed: {
    code: 'REAUTH_REQUIRED',
    message: 'For security, log in again before changing your password, then retry from Settings.'
  },
  same_password: {
    code: 'SAME_PASSWORD',
    message: 'That is already your password. Choose a different one.'
  },
  weak_password: {
    code: 'WEAK_PASSWORD',
    message: 'That password is too weak. Use at least 8 characters, mixing letters and numbers.'
  },
  email_address_invalid: {
    code: 'INVALID_EMAIL',
    message: "That doesn't look like a valid email address."
  },
  validation_failed: {
    code: 'INVALID_EMAIL',
    message: "That doesn't look like a valid email address."
  },
  over_email_send_rate_limit: {
    code: 'RATE_LIMITED',
    message: 'Too many attempts. Please wait a few minutes and try again.'
  },
  over_request_rate_limit: {
    code: 'RATE_LIMITED',
    message: 'Too many attempts. Please wait a few minutes and try again.'
  },
  invalid_credentials: {
    code: 'INVALID_CREDENTIALS',
    message: 'Incorrect email or password.'
  },
  email_not_confirmed: {
    code: 'EMAIL_NOT_CONFIRMED',
    message: 'Please confirm your email first — check your inbox for the link we sent you.'
  },
  user_banned: {
    code: 'ACCOUNT_SUSPENDED',
    message: 'This account has been suspended.'
  },
  signup_disabled: {
    code: 'SIGNUP_DISABLED',
    message: 'New registrations are temporarily disabled.'
  }
}

export function mapAuthError(
  code: string | null | undefined,
  fallbackMessage: string
): MappedAuthError {
  if (code) {
    const mapped = AUTH_ERROR_MESSAGES[code]
    if (mapped) return mapped
  }
  return { code: 'AUTH_ERROR', message: fallbackMessage }
}
