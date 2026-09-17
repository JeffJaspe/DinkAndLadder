import { subscriptionAdminContext, rethrowSubscriptionAdminError } from '~/server/utils/subscription-admin'

/** Every club subscription with its club, plan and last payment. SuperAdmin only. */
export default defineEventHandler(async (event) => {
  const { userId, subscriptions } = await subscriptionAdminContext(event)
  try {
    const service = await subscriptions()
    return { data: await service.listForAdmin(userId) }
  } catch (err) {
    rethrowSubscriptionAdminError(err)
  }
})
