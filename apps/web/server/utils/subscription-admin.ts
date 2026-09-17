import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { createSubscriptionRepository } from '~/server/domains/payment/repositories/subscription.repository'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import {
  createSubscriptionPlanAdminService,
  SubscriptionPlanAdminServiceError
} from '~/server/domains/payment/services/subscription-plan-admin.service'
import { ClubSubscriptionServiceError } from '~/server/domains/payment/services/club-subscription.service'
import { createClubSubscriptionServiceFor } from './club-subscription-service'
import { getOptionalUser } from './optional-user'
import { apiError } from './api-error'

/**
 * The `/admin/subscription-*` and `/admin/billing` routes all start the same
 * way: signed in, service role, and the SuperAdmin check happens inside the
 * service so a route cannot forget it. This returns the two services and the
 * caller's id; the routes stay at "read the body, call, rethrow".
 */
export async function subscriptionAdminContext(event: H3Event) {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to change platform settings.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const platformConfig = createPlatformConfigRepository(serviceClient)

  return {
    userId: claims.sub,
    plans: createSubscriptionPlanAdminService(
      createSubscriptionRepository(serviceClient),
      createPlatformAdminService(platformConfig),
      platformConfig
    ),
    subscriptions: () => createClubSubscriptionServiceFor(serviceClient)
  }
}

/** Service errors become the API envelope; anything else is a 500 the caller logs. */
export function rethrowSubscriptionAdminError(err: unknown): never {
  if (err instanceof SubscriptionPlanAdminServiceError || err instanceof ClubSubscriptionServiceError) {
    throw apiError(err.status, err.code, err.message)
  }
  throw err
}
