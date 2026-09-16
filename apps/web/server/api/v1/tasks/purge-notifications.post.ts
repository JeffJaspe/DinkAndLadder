import { serverSupabaseServiceRole } from '#supabase/server'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { NOTIFICATION_RETENTION } from '~/server/domains/notification/services/notification-retention'
import { apiError } from '~/server/utils/api-error'

/**
 * Sweep: delete notifications that have outlived the retention policy.
 *
 * The policy, and why it is two clocks rather than one, lives in
 * notification-retention.ts. This endpoint only applies it.
 *
 * Scheduled rather than opportunistic, for the same reason as the open-play
 * sweep: pruning on read would make an ordinary GET write to the database, and
 * would prune only for people who happen to be active — which is precisely
 * backwards, since the rows worth deleting belong to the accounts nobody opens.
 *
 * Idempotent and safe to run more often than daily; a second run inside the
 * same day finds nothing new. Guarded by the same shared secret as the other
 * task endpoints, and with CRON_SECRET unset it refuses to run at all rather
 * than leaving an unauthenticated delete exposed.
 */
export default defineEventHandler(async (event) => {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    throw apiError(
      503,
      'NOT_CONFIGURED',
      'CRON_SECRET is not set, so scheduled tasks are disabled.'
    )
  }

  const authorization = getRequestHeader(event, 'authorization')
  if (authorization !== `Bearer ${secret}`) {
    throw apiError(401, 'AUTH_REQUIRED', 'This endpoint is for the scheduler.')
  }

  // No signed-in user behind this request, so there is no RLS identity to act
  // under — and notifications has no DELETE policy for players by design.
  const client = serverSupabaseServiceRole(event)
  const notifications = createNotificationService(createNotificationRepository(client))

  try {
    const deleted = await notifications.purgeExpired()

    return {
      deleted,
      policy: {
        read_days: NOTIFICATION_RETENTION.readDays,
        unread_days: NOTIFICATION_RETENTION.unreadDays
      },
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[POST /api/v1/tasks/purge-notifications] sweep failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not purge expired notifications.')
  }
})
