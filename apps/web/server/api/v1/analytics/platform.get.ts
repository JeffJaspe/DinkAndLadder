import { serverSupabaseClient } from '#supabase/server'
import { createAnalyticsService } from '~/server/domains/analytics/services/analytics.service'

export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient(event)
  const service = createAnalyticsService(client)

  const stats = await service.getPlatformStats()
  return stats
})
