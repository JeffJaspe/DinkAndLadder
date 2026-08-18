import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createAchievementRepository } from '~/server/domains/achievement/repositories/achievement.repository'
import { createAchievementService, AchievementServiceError } from '~/server/domains/achievement/services/achievement.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const achievementId = getRouterParam(event, 'achievementId')
  if (!achievementId) {
    throw createError({ statusCode: 400, statusMessage: 'achievementId is required.' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const achievementRepo = createAchievementRepository(client)
  const service = createAchievementService(achievementRepo)

  try {
    const claimed = await service.claimAchievement(profile.id, achievementId)
    return claimed
  } catch (err) {
    if (err instanceof AchievementServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
