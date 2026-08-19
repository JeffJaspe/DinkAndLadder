export interface TurnstileVerifyResult {
  success: boolean
  errorCodes: string[]
}

export type TurnstileFetcher = (
  url: string,
  init: { method: 'POST'; body: URLSearchParams }
) => Promise<{ success: boolean; 'error-codes'?: string[] }>

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Verifies a Cloudflare Turnstile response token server-side. Fails closed:
 * a missing token or an unreachable verification service is treated as failure,
 * never as "skip the check."
 */
export async function verifyTurnstileToken(
  fetcher: TurnstileFetcher,
  secretKey: string,
  token: string | undefined,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  if (!token) {
    return { success: false, errorCodes: ['missing-input-response'] }
  }

  const body = new URLSearchParams({ secret: secretKey, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const result = await fetcher(TURNSTILE_VERIFY_URL, { method: 'POST', body })
    return { success: result.success === true, errorCodes: result['error-codes'] ?? [] }
  } catch {
    return { success: false, errorCodes: ['internal-verification-error'] }
  }
}
