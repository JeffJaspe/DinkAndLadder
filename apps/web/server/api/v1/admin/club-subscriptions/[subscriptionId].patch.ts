import type { AdminUpdateSubscriptionDto } from '~/server/domains/payment/dto/club-billing.dto'
import { subscriptionAdminContext, rethrowSubscriptionAdminError } from '~/server/utils/subscription-admin'
import { apiError } from '~/server/utils/api-error'

/** Extend by N months, or cancel immediately. */
export default defineEventHandler(async (event) => {
  const subscriptionId = getRouterParam(event, 'subscriptionId')
  if (!subscriptionId) {
    throw apiError(400, 'MISSING_PARAMETER', 'subscriptionId is required.')
  }
  const { userId, subscriptions } = await subscriptionAdminContext(event)
  const body = await readBody<Partial<AdminUpdateSubscriptionDto>>(event)

  if (body?.action === 'extend' && typeof body.months !== 'number') {
    throw apiError(400, 'VALIDATION_ERROR', 'months is required to extend.')
  }
  if (body?.action !== 'extend' && body?.action !== 'cancel') {
    throw apiError(400, 'VALIDATION_ERROR', 'action must be extend or cancel.')
  }

  try {
    const service = await subscriptions()
    if (body.action === 'extend') {
      return await service.extend(userId, subscriptionId, body.months as number, body.notes ?? null)
    }
    return await service.adminCancel(userId, subscriptionId, body.notes ?? null)
  } catch (err) {
    rethrowSubscriptionAdminError(err)
  }
})
