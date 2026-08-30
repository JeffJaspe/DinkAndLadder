import { serverSupabaseClient } from '#supabase/server'
import { createAchievementRepository } from '~/server/domains/achievement/repositories/achievement.repository'
import { createAchievementService } from '~/server/domains/achievement/services/achievement.service'
import { requireFeature, FEATURE_ACHIEVEMENTS } from '~/server/utils/require-feature'

export default defineEventHandler(async (event) => {
  // Off means gone, not hidden: the client gate only stops this app
  // rendering it, never a stale bundle or a direct call.
  await requireFeature(event, FEATURE_ACHIEVEMENTS)

  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw createError({ statusCode: 400, statusMessage: 'playerId is required.' })
  }

  const client = await serverSupabaseClient(event)
  const achievementRepo = createAchievementRepository(client)
  const service = createAchievementService(achievementRepo)

  const achievements = await service.getPlayerAchievements(playerId)
  const points = await service.getPlayerPoints(playerId)

  return { achievements, total_points: points }
})
