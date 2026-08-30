import { describe, expect, it } from 'vitest'
import { mapAuthError } from '../../server/domains/identity/services/auth-error-mapper'

describe('mapAuthError', () => {
  it('maps user_already_exists to a friendly duplicate-email message', () => {
    const result = mapAuthError('user_already_exists', 'User already registered')
    expect(result.code).toBe('EMAIL_ALREADY_REGISTERED')
    expect(result.message).toMatch(/already has an account/i)
  })

  it('maps email_exists (signUp variant) the same as user_already_exists', () => {
    const result = mapAuthError('email_exists', 'raw message')
    expect(result.code).toBe('EMAIL_ALREADY_REGISTERED')
  })

  it('maps reauthentication_needed to guidance for the password-change form', () => {
    const result = mapAuthError('reauthentication_needed', 'raw message')
    expect(result.code).toBe('REAUTH_REQUIRED')
    expect(result.message).toMatch(/log in again/i)
  })

  it('maps same_password to a friendly message', () => {
    const result = mapAuthError('same_password', 'raw message')
    expect(result.code).toBe('SAME_PASSWORD')
  })

  it('maps weak_password to a friendly password-strength message', () => {
    const result = mapAuthError('weak_password', 'raw message')
    expect(result.code).toBe('WEAK_PASSWORD')
    expect(result.message).toMatch(/weak/i)
  })

  it('maps email_address_invalid to a friendly invalid-email message', () => {
    const result = mapAuthError('email_address_invalid', 'raw message')
    expect(result.code).toBe('INVALID_EMAIL')
  })

  it('maps over_email_send_rate_limit to a rate-limited message', () => {
    const result = mapAuthError('over_email_send_rate_limit', 'raw message')
    expect(result.code).toBe('RATE_LIMITED')
    expect(result.message).toMatch(/wait/i)
  })

  it('maps invalid_credentials to a friendly login message', () => {
    const result = mapAuthError('invalid_credentials', 'raw message')
    expect(result.code).toBe('INVALID_CREDENTIALS')
    expect(result.message).toMatch(/incorrect/i)
  })

  it('maps email_not_confirmed to a confirm-your-email message', () => {
    const result = mapAuthError('email_not_confirmed', 'raw message')
    expect(result.code).toBe('EMAIL_NOT_CONFIRMED')
  })

  it('falls back to the provider message for an unknown code', () => {
    const result = mapAuthError('some_future_code_we_dont_know', 'raw provider message')
    expect(result.code).toBe('AUTH_ERROR')
    expect(result.message).toBe('raw provider message')
  })

  it('falls back to the provider message when no code is present at all', () => {
    const result = mapAuthError(undefined, 'raw provider message')
    expect(result.code).toBe('AUTH_ERROR')
    expect(result.message).toBe('raw provider message')
  })
})
