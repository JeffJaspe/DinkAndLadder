import { serverSupabaseClient } from '#supabase/server'
import { createAchievementRepository } from '~/server/domains/achievement/repositories/achievement.repository'
import { createAchievementService } from '~/server/domains/achievement/services/achievement.service'

export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient(event)
  const achievementRepo = createAchievementRepository(client)
  const service = createAchievementService(achievementRepo)

  const achievements = await service.getAllDefinitions()
  return { achievements }
})
