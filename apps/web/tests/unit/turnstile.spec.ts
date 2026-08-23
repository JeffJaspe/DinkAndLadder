import { describe, expect, it, vi } from 'vitest'
import { TURNSTILE_VERIFY_URL, verifyTurnstileToken } from '../../server/utils/turnstile'

describe('verifyTurnstileToken', () => {
  it('fails closed and never calls the fetcher when no token is provided', async () => {
    const fetcher = vi.fn()

    const result = await verifyTurnstileToken(fetcher, 'secret', undefined)

    expect(result.success).toBe(false)
    expect(result.errorCodes).toContain('missing-input-response')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('returns success when Cloudflare confirms the token', async () => {
    const fetcher = vi.fn().mockResolvedValue({ success: true })

    const result = await verifyTurnstileToken(fetcher, 'secret', 'token-123', '1.2.3.4')

    expect(result.success).toBe(true)
    expect(result.errorCodes).toEqual([])
    expect(fetcher).toHaveBeenCalledWith(
      TURNSTILE_VERIFY_URL,
      expect.objectContaining({ method: 'POST' })
    )
    const [, init] = fetcher.mock.calls[0]
    expect((init.body as URLSearchParams).get('secret')).toBe('secret')
    expect((init.body as URLSearchParams).get('response')).toBe('token-123')
    expect((init.body as URLSearchParams).get('remoteip')).toBe('1.2.3.4')
  })

  it('returns failure with error codes when Cloudflare rejects the token', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ success: false, 'error-codes': ['timeout-or-duplicate'] })

    const result = await verifyTurnstileToken(fetcher, 'secret', 'token-123')

    expect(result.success).toBe(false)
    expect(result.errorCodes).toEqual(['timeout-or-duplicate'])
  })

  it('fails closed when the verification request itself errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network error'))

    const result = await verifyTurnstileToken(fetcher, 'secret', 'token-123')

    expect(result.success).toBe(false)
    expect(result.errorCodes).toContain('internal-verification-error')
  })
})
