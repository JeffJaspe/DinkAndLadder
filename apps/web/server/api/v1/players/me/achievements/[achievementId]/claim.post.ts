import { serverSupabaseClient } from '#supabase/server'
import { createAchievementRepository } from '~/server/domains/achievement/repositories/achievement.repository'
import {
  createAchievementService,
  AchievementServiceError
} from '~/server/domains/achievement/services/achievement.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { requireFeature, FEATURE_ACHIEVEMENTS } from '~/server/utils/require-feature'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  // Off means gone, not hidden: the client gate only stops this app
  // rendering it, never a stale bundle or a direct call.
  await requireFeature(event, FEATURE_ACHIEVEMENTS)

  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const achievementId = getRouterParam(event, 'achievementId')
  if (!achievementId) {
    throw apiError(400, 'MISSING_PARAMETER', 'achievementId is required.')
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const achievementRepo = createAchievementRepository(client)
  const service = createAchievementService(achievementRepo)

  try {
    const claimed = await service.claimAchievement(profile.id, achievementId)
    return claimed
  } catch (err) {
    if (err instanceof AchievementServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
