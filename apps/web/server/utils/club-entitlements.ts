import type { SupabaseClient } from '@supabase/supabase-js'
import { createSubscriptionRepository } from '~/server/domains/payment/repositories/subscription.repository'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import {
  createClubEntitlementsService,
  type ClubEntitlementsService
} from '~/server/domains/payment/services/club-entitlements.service'

/**
 * The entitlements resolver a controller hands to the event service.
 *
 * Built on the service-role client because `subscription_plans` has no
 * user-facing write policy and `platform_config` has no policies at all; a
 * user-scoped client would read an empty config and silently use the default
 * grace window. The grace-days read is one small query per request, and that
 * is deliberate: the resolver's own docstring says why it must not cache.
 */
export async function createRequestEntitlements(
  serviceClient: SupabaseClient
): Promise<ClubEntitlementsService> {
  const config = await createPlatformConfigRepository(serviceClient).getConfig()
  return createClubEntitlementsService(createSubscriptionRepository(serviceClient), {
    graceDays: config?.subscription_grace_days ?? 7
  })
}
