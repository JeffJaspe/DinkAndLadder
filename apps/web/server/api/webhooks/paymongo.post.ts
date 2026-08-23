import { apiError } from '~/server/utils/api-error'

/**
 * Payments are explicitly OUT of MVP scope — see /docs/03-MVP-SCOPE.md
 * ("Explicitly Out of MVP": Payments, Subscription billing) and CLAUDE.md §6.
 *
 * Same rationale as the Stripe handler: the previous implementation verified a
 * signature, logged the event and returned 200, so PayMongo treated it as
 * delivered and never retried. It also accepted a test-mode signature in place
 * of a live one (`testSignature || liveSignature`), which erased the live/test
 * boundary.
 *
 * 501 keeps events queued upstream until the payments domain is promoted.
 */
export default defineEventHandler(() => {
  throw apiError(
    501,
    'NOT_IMPLEMENTED',
    'Payment processing is not enabled on this deployment.'
  )
})
