import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'
import { assuranceLevelOf, createMfaServiceFor } from '~/server/utils/mfa'

/** Enrolment state, what this session has proven, and whether 2FA is required here. */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in first.')

  const { service } = await createMfaServiceFor(event)
  return { data: await service.status(claims.sub, assuranceLevelOf(claims)) }
})
