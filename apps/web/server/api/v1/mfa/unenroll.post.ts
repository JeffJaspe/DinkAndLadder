import { readBody } from 'h3'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'
import {
  createMfaServiceFor,
  invalidateMfaEnrolledCache,
  requireAal2,
  unwrapMfaOutcome
} from '~/server/utils/mfa'
import type { MfaUnenrollRequestDto } from '~/server/domains/identity/dto/mfa.dto'

/**
 * Turns 2FA off. Needs an aal2 session *and* a fresh code from the app: a
 * tab someone walked away from must not be enough. Refused for accounts the
 * policy requires it on (409 from the service).
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in first.')
  requireAal2(claims)

  const body = await readBody<Partial<MfaUnenrollRequestDto>>(event)
  if (!body?.code || !/^\d{6}$/.test(body.code.trim())) {
    throw apiError(400, 'VALIDATION_ERROR', 'Enter the 6-digit code from your app.')
  }

  const { service, userClient } = await createMfaServiceFor(event)
  const outcome = await service.unenroll(userClient, claims.sub, body.code)
  invalidateMfaEnrolledCache(claims.sub)
  unwrapMfaOutcome(outcome)

  return { message: 'Two-factor authentication is off.' }
})
