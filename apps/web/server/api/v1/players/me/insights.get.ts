import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createAnalyticsService } from '~/server/domains/analytics/services/analytics.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)

  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required' })
  }

  const service = createAnalyticsService(client)
  const insights = await service.getPlayerInsights(profile.id)

  return insights
})
