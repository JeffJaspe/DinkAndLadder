import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import {
  createNotificationService,
  NotificationServiceError
} from '~/server/domains/notification/services/notification.service'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to mark notifications as read.')
  }

  const notificationId = getRouterParam(event, 'notificationId')
  if (!notificationId) {
    throw apiError(400, 'VALIDATION_ERROR', 'notificationId is required.')
  }

  const client = await serverSupabaseClient(event)
  const service = createNotificationService(createNotificationRepository(client))

  try {
    const notification = await service.markAsRead(claims.sub, notificationId)
    return {
      data: notification,
      message: 'Notification marked as read',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    if (err instanceof NotificationServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    console.error(`[PATCH /api/v1/notifications/${notificationId}/read] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not mark notification as read.')
  }
})
