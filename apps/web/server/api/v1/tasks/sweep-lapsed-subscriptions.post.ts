import { serverSupabaseServiceRole } from '#supabase/server'
import { createClubSubscriptionServiceFor } from '~/server/utils/club-subscription-service'
import { apiError } from '~/server/utils/api-error'

/**
 * Sweep: close club subscriptions whose paid period has run out.
 *
 * With no gateway there is no webhook to flip a status, so without this an
 * admin grant of three months would entitle the club forever. Idempotent —
 * a closed row has `ended_at` set and is never read again — and guarded by
 * the same shared secret as `close-stale-open-play`.
 */
export default defineEventHandler(async (event) => {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    throw apiError(503, 'NOT_CONFIGURED', 'CRON_SECRET is not set, so scheduled tasks are disabled.')
  }
  const authorization = getRequestHeader(event, 'authorization')
  if (authorization !== `Bearer ${secret}`) {
    throw apiError(401, 'AUTH_REQUIRED', 'This endpoint is for the scheduler.')
  }

  try {
    const service = await createClubSubscriptionServiceFor(serverSupabaseServiceRole(event))
    const result = await service.sweepLapsed()
    return { ...result, request_id: crypto.randomUUID() }
  } catch (err) {
    console.error('[POST /api/v1/tasks/sweep-lapsed-subscriptions] sweep failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not sweep lapsed subscriptions.')
  }
})
