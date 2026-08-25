import { serverSupabaseClient } from '#supabase/server'
import { apiError } from '~/server/utils/api-error'

/**
 * The convenience-fee ladder, for quoting a total before a player commits.
 *
 * Public and unauthenticated on purpose: the registration screen has to show
 * what entering costs, and a fee nobody can see until after they have paid it
 * is a fee they will dispute. RLS grants SELECT to everyone for the same reason
 * (034, changeSet 0002); writes go through the admin endpoint on the service
 * role.
 *
 * Inactive rules are filtered here rather than in the policy so an admin screen
 * can still list them through the same table.
 */
export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient(event)

  const { data, error } = await client
    .from('platform_fee_rules')
    .select(
      'id, fee_type, value, min_amount_cents, max_amount_cents, min_fee_cents, max_fee_cents, currency, is_active, sort_order'
    )
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[GET /api/v1/platform/fee-rules] failed:', error)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load the fee rules.')
  }

  return { data: data ?? [] }
})
