import { serverSupabaseServiceRole } from '#supabase/server'
import { createSubscriptionRepository } from '~/server/domains/payment/repositories/subscription.repository'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { toClubSubscriptionPlanDto } from '~/server/domains/payment/dto/subscription.dto'
import { apiError } from '~/server/utils/api-error'

/**
 * The club plans a visitor may see, plus whether anything can be bought.
 *
 * Public and unauthenticated like `fee-rules.get.ts`. Filtered to
 * `is_public AND is_active` here AND typed as `ClubSubscriptionPlanDto`, which
 * has no `is_public` field — so a draft plan's placeholder price cannot leak
 * through this route by construction (056 §2). Read on the service role
 * because 0008's RLS grants anon SELECT on public rows only, and the
 * `billing_mode` read beside it has no user-facing policy at all.
 */
export default defineEventHandler(async (event) => {
  const client = serverSupabaseServiceRole(event)

  try {
    const [plans, config] = await Promise.all([
      createSubscriptionRepository(client).listPublicClubPlans(),
      createPlatformConfigRepository(client).getConfig()
    ])

    return {
      data: plans.filter((p) => p.is_active).map(toClubSubscriptionPlanDto),
      billing: {
        mode: config?.billing_mode ?? 'off',
        notice: config?.billing_notice ?? null
      }
    }
  } catch (err) {
    console.error('[GET /api/v1/platform/subscription-plans] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load the plans.')
  }
})
