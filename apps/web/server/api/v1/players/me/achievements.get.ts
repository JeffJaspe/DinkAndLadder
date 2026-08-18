import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createAchievementRepository } from '~/server/domains/achievement/repositories/achievement.repository'
import { createAchievementService } from '~/server/domains/achievement/services/achievement.service'
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
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const achievementRepo = createAchievementRepository(client)
  const service = createAchievementService(achievementRepo)

  const achievements = await service.getPlayerAchievements(profile.id)
  const points = await service.getPlayerPoints(profile.id)

  return { achievements, total_points: points }
})
