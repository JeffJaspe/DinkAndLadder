import type { SupabaseClient } from '@supabase/supabase-js'
import { createSubscriptionRepository } from '~/server/domains/payment/repositories/subscription.repository'
import { createTransactionRepository } from '~/server/domains/payment/repositories/transaction.repository'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubVerificationService } from '~/server/domains/club/services/club-verification.service'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createClubSubscriptionService,
  type ClubSubscriptionService
} from '~/server/domains/payment/services/club-subscription.service'
import { createRequestEntitlements } from './club-entitlements'

/**
 * The club-subscription service has nine dependencies, and five routes build
 * it. One composition root, so a route cannot forget one and silently get a
 * service that skips verification or never restricts an event.
 *
 * Everything is on the service-role client: `club_subscriptions`,
 * `payment_transactions`, `subscription_plans` and `platform_config` all have
 * RLS that a user-scoped client cannot write through, and the service does its
 * own authorisation (club admin, or SuperAdmin) before every write.
 */
export async function createClubSubscriptionServiceFor(
  serviceClient: SupabaseClient
): Promise<ClubSubscriptionService> {
  const platformConfig = createPlatformConfigRepository(serviceClient)
  const clubs = createClubRepository(serviceClient)
  const memberships = createClubMembershipRepository(serviceClient)
  const platformAdmin = createPlatformAdminService(platformConfig)

  return createClubSubscriptionService({
    subscriptions: createSubscriptionRepository(serviceClient),
    transactions: createTransactionRepository(serviceClient),
    platformConfig,
    platformAdmin,
    memberships,
    clubs,
    events: createEventRepository(serviceClient),
    entitlements: await createRequestEntitlements(serviceClient),
    verification: createClubVerificationService(clubs, memberships, platformAdmin)
  })
}
