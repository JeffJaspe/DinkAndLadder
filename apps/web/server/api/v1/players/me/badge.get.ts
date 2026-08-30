import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createBadgeRepository } from '~/server/domains/badge/repositories/badge.repository'
import { createBadgeService } from '~/server/domains/badge/services/badge.service'
import { AVAILABLE_BADGES } from '~/server/domains/badge/dto/badge.dto'
import { requireFeature, FEATURE_ACHIEVEMENTS } from '~/server/utils/require-feature'

export default defineEventHandler(async (event) => {
  // Off means gone, not hidden: the client gate only stops this app
  // rendering it, never a stale bundle or a direct call.
  await requireFeature(event, FEATURE_ACHIEVEMENTS)

  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const supabase = await serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(supabase)
  const badgeRepo = createBadgeRepository(supabase)
  const badgeService = createBadgeService(badgeRepo)

  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 404, statusMessage: 'Player profile not found' })
  }

  const showcase = await badgeService.getShowcase(profile.id)

  return {
    data: {
      showcase,
      availableBadges: AVAILABLE_BADGES
    }
  }
})
