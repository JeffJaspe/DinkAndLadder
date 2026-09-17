import type { AdminCreatePlanDto } from '~/server/domains/payment/services/subscription-plan-admin.service'
import { subscriptionAdminContext, rethrowSubscriptionAdminError } from '~/server/utils/subscription-admin'
import { apiError } from '~/server/utils/api-error'

/** Create a club plan. It is created unpublished; publishing is a separate PATCH. */
export default defineEventHandler(async (event) => {
  const { userId, plans } = await subscriptionAdminContext(event)
  const body = await readBody<AdminCreatePlanDto>(event)
  if (!body || typeof body !== 'object') {
    throw apiError(400, 'VALIDATION_ERROR', 'A plan body is required.')
  }
  try {
    return await plans.createPlan(userId, body)
  } catch (err) {
    rethrowSubscriptionAdminError(err)
  }
})
