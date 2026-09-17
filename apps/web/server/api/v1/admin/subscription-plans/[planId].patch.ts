import type { AdminUpdatePlanDto } from '~/server/domains/payment/services/subscription-plan-admin.service'
import { subscriptionAdminContext, rethrowSubscriptionAdminError } from '~/server/utils/subscription-admin'
import { apiError } from '~/server/utils/api-error'

/**
 * Edit one plan. There is deliberately no DELETE beside this:
 * `club_subscriptions.plan_id` is a foreign key, so plans are deactivated,
 * never removed.
 */
export default defineEventHandler(async (event) => {
  const planId = getRouterParam(event, 'planId')
  if (!planId) {
    throw apiError(400, 'MISSING_PARAMETER', 'planId is required.')
  }
  const { userId, plans } = await subscriptionAdminContext(event)
  const body = await readBody<AdminUpdatePlanDto>(event)
  if (!body || typeof body !== 'object') {
    throw apiError(400, 'VALIDATION_ERROR', 'A plan body is required.')
  }
  try {
    return await plans.updatePlan(userId, planId, body)
  } catch (err) {
    rethrowSubscriptionAdminError(err)
  }
})
