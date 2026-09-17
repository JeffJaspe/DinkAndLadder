import { subscriptionAdminContext, rethrowSubscriptionAdminError } from '~/server/utils/subscription-admin'

/** Billing mode, test-mode notice and grace days. SuperAdmin only. */
export default defineEventHandler(async (event) => {
  const { userId, plans } = await subscriptionAdminContext(event)
  try {
    return await plans.getBilling(userId)
  } catch (err) {
    rethrowSubscriptionAdminError(err)
  }
})
