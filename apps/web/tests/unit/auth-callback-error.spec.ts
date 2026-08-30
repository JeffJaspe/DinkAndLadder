import { describe, expect, it } from 'vitest'
import { describeAuthCallbackError, parseAuthCallbackError } from '../../utils/auth-callback-error'

describe('parseAuthCallbackError', () => {
  it('reads an expired reset link from the query string', () => {
    const result = parseAuthCallbackError(
      {
        error: 'access_denied',
        error_code: 'otp_expired',
        error_description: 'Email link is invalid or has expired'
      },
      ''
    )

    expect(result).toEqual({
      code: 'otp_expired',
      description: 'Email link is invalid or has expired'
    })
  })

  it('reads the same error from the fragment, which never reaches the server', () => {
    const result = parseAuthCallbackError(
      {},
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb='
    )

    expect(result?.code).toBe('otp_expired')
    // `+` is Supabase's encoding for a space; URLSearchParams decodes it.
    expect(result?.description).toBe('Email link is invalid or has expired')
  })

  it('prefers the query string when a parameter appears in both', () => {
    const result = parseAuthCallbackError({ error_code: 'from_query' }, '#error_code=from_hash')

    expect(result?.code).toBe('from_query')
  })

  it('takes the first value when the router hands back a repeated parameter', () => {
    const result = parseAuthCallbackError(
      { error_code: ['otp_expired', 'something_else'], error_description: 'expired' },
      ''
    )

    expect(result?.code).toBe('otp_expired')
  })

  it('returns null for an ordinary page with no auth parameters', () => {
    expect(parseAuthCallbackError({}, '')).toBeNull()
    expect(parseAuthCallbackError({ tab: 'matches' }, '#section-2')).toBeNull()
  })

  it('ignores a bare error param, which an ordinary app URL might carry', () => {
    // Supabase always sends a code or a description alongside it, so requiring
    // one keeps this from hijacking, say, /clubs?error=1.
    expect(parseAuthCallbackError({ error: '1' }, '')).toBeNull()
  })

  it('falls back to the error name when no specific code is given', () => {
    const result = parseAuthCallbackError(
      { error: 'server_error', error_description: 'Unexpected failure' },
      ''
    )

    expect(result?.code).toBe('server_error')
  })
})

describe('describeAuthCallbackError', () => {
  it('explains an expired link in terms of what the user should do', () => {
    const message = describeAuthCallbackError({ code: 'otp_expired', description: 'raw' })

    expect(message).toMatch(/expired or was already used/i)
  })

  it('falls back to the provider description for an unmapped code', () => {
    const message = describeAuthCallbackError({
      code: 'something_new',
      description: 'Provider said this'
    })

    expect(message).toBe('Provider said this')
  })

  it('still says something useful when there is no description at all', () => {
    const message = describeAuthCallbackError({ code: 'something_new', description: '' })

    expect(message).toMatch(/could not be used/i)
  })
})
