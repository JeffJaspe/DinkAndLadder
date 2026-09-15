import { getRequestURL } from 'h3'
import { decideMfaGate, isGatedPath } from '~/utils/mfa-gate'
import { getOptionalUser } from '~/server/utils/optional-user'
import { assuranceLevelOf, isMfaEnrolled } from '~/server/utils/mfa'
import { apiError } from '~/server/utils/api-error'

/**
 * The server half of "mandatory 2FA".
 *
 * The client-side route middleware sends a password-only session on an
 * enrolled account to the challenge screen, but a redirect is a courtesy: the
 * API is what the session can actually do, and a stolen cookie does not run
 * Vue. So every `/api/v1` request from a signed-in caller is checked here
 * against the pure decision in utils/mfa-gate.ts.
 *
 * Cost: for signed-in callers, one memoised PK read (server/utils/mfa.ts).
 * Nothing runs for pages, assets, webhooks or signed-out requests.
 */
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!isGatedPath(path)) return

  const claims = await getOptionalUser(event)
  if (!claims) return

  const aal = assuranceLevelOf(claims)
  // Only the aal1 branch can be refused on enrolment, so only it pays the read.
  const enrolled = aal === 'aal1' ? await isMfaEnrolled(event, claims.sub) : false

  const verdict = decideMfaGate({ path, aal, enrolled })
  if (!verdict.allow) {
    throw apiError(403, verdict.code, verdict.message)
  }
})
