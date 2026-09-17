import { subscriptionAdminContext, rethrowSubscriptionAdminError } from '~/server/utils/subscription-admin'

/** Every club plan, published or not. SuperAdmin only. */
export default defineEventHandler(async (event) => {
  const { userId, plans } = await subscriptionAdminContext(event)
  try {
    return { data: await plans.listPlans(userId) }
  } catch (err) {
    rethrowSubscriptionAdminError(err)
  }
})
