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
const AUTH_ERROR_MESSAGES: Record<string, MappedAuthError> = {
  user_already_exists: {
    code: 'EMAIL_ALREADY_REGISTERED',
    message: 'That email is already registered. Try logging in instead.'
  },
  email_exists: {
    code: 'EMAIL_ALREADY_REGISTERED',
    message: 'That email is already registered. Try logging in instead.'
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
