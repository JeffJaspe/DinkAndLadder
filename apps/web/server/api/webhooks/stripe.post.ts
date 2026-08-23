import { apiError } from '~/server/utils/api-error'

/**
 * Payments are explicitly OUT of MVP scope — see /docs/03-MVP-SCOPE.md
 * ("Explicitly Out of MVP": Payments, Subscription billing) and CLAUDE.md §6.
 *
 * This endpoint previously verified the Stripe signature and then discarded the
 * event (every handler body was a console.log) while returning 200 — which tells
 * Stripe the event was delivered successfully, so it is never retried and the
 * payment record is lost permanently.
 *
 * Returning 501 is deliberate: Stripe retries 5xx responses with backoff, so
 * events stay queued upstream until the payments domain is actually promoted
 * into scope and implemented. Do not "fix" this by returning 200.
 */
export default defineEventHandler(() => {
  throw apiError(501, 'NOT_IMPLEMENTED', 'Payment processing is not enabled on this deployment.')
})
