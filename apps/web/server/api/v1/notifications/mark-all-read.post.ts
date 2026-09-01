import { serverSupabaseClient } from '#supabase/server'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to mark notifications as read.')
  }

  const client = await serverSupabaseClient(event)
  const service = createNotificationService(createNotificationRepository(client))

  try {
    await service.markAllAsRead(claims.sub)
    return {
      data: null,
      message: 'All notifications marked as read',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[POST /api/v1/notifications/mark-all-read] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not mark all notifications as read.')
  }
})
