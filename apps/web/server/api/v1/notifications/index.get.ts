import { serverSupabaseClient } from '#supabase/server'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import type { NotificationQuery } from '~/server/domains/notification/dto/notification.dto'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string') return fallback
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed
}

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your notifications.')
  }

  const rawQuery = getQuery(event)
  const query: NotificationQuery = {
    limit: Math.min(parsePositiveInt(rawQuery.limit, DEFAULT_LIMIT), MAX_LIMIT),
    offset: parsePositiveInt(rawQuery.offset, 0),
    unread_only: rawQuery.unread_only === 'true'
  }

  const client = await serverSupabaseClient(event)
  const service = createNotificationService(createNotificationRepository(client))

  try {
    const notifications = await service.list(claims.sub, query)
    return {
      notifications: notifications,
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[GET /api/v1/notifications] list failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not list notifications.')
  }
})
