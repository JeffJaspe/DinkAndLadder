import { serverSupabaseClient } from '#supabase/server'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your notifications.')
  }

  const client = await serverSupabaseClient(event)
  const service = createNotificationService(createNotificationRepository(client))

  try {
    const count = await service.countUnread(claims.sub)
    return {
      data: { unread_count: count },
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[GET /api/v1/notifications/unread-count] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not get unread count.')
  }
})
