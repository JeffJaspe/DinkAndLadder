import type { UpdateBillingSettingsDto } from '~/server/domains/payment/services/subscription-plan-admin.service'
import { subscriptionAdminContext, rethrowSubscriptionAdminError } from '~/server/utils/subscription-admin'
import { apiError } from '~/server/utils/api-error'

/** Billing mode, test-mode notice and grace days. `live` is refused by the service (501). */
export default defineEventHandler(async (event) => {
  const { userId, plans } = await subscriptionAdminContext(event)
  const body = await readBody<UpdateBillingSettingsDto>(event)
  if (!body || typeof body !== 'object') {
    throw apiError(400, 'VALIDATION_ERROR', 'A settings body is required.')
  }
  try {
    return await plans.updateBilling(userId, body)
  } catch (err) {
    rethrowSubscriptionAdminError(err)
  }
})
