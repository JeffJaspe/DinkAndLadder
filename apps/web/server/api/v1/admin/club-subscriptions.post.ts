import type { AdminGrantSubscriptionDto } from '~/server/domains/payment/dto/club-billing.dto'
import { subscriptionAdminContext, rethrowSubscriptionAdminError } from '~/server/utils/subscription-admin'
import { apiError } from '~/server/utils/api-error'

/** Grant a club a plan for N months. The only route to a paid plan while nothing is on sale. */
export default defineEventHandler(async (event) => {
  const { userId, subscriptions } = await subscriptionAdminContext(event)
  const body = await readBody<Partial<AdminGrantSubscriptionDto>>(event)
  if (!body?.club_id || !body.plan_id || typeof body.months !== 'number') {
    throw apiError(400, 'VALIDATION_ERROR', 'club_id, plan_id and months are required.')
  }
  try {
    const service = await subscriptions()
    return await service.grant(userId, body.club_id, body.plan_id, body.months, body.notes ?? null)
  } catch (err) {
    rethrowSubscriptionAdminError(err)
  }
})
