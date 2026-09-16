import { serverSupabaseServiceRole } from '#supabase/server'
import { createBadgeRepository } from '~/server/domains/badge/repositories/badge.repository'
import { createBadgeService } from '~/server/domains/badge/services/badge.service'
import { createAchievementRepository } from '~/server/domains/achievement/repositories/achievement.repository'
import { requireFeature, FEATURE_ACHIEVEMENTS } from '~/server/utils/require-feature'
import { apiError } from '~/server/utils/api-error'

/**
 * The badge on a player's public profile.
 *
 * Resolved through the service rather than read straight off the showcase row,
 * so a badge whose achievement was never earned — or has since been retired —
 * simply does not render. Public profiles are where an unearned badge would do
 * the most damage to the one thing this product sells: a number and a record
 * other players trust.
 */
export default defineEventHandler(async (event) => {
  // Off means gone, not hidden: the client gate only stops this app
  // rendering it, never a stale bundle or a direct call.
  await requireFeature(event, FEATURE_ACHIEVEMENTS)

  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw apiError(400, 'INVALID_INPUT', 'Player ID required.')
  }

  const supabase = await serverSupabaseServiceRole(event)
  const badgeService = createBadgeService(
    createBadgeRepository(supabase),
    createAchievementRepository(supabase)
  )

  const badge = await badgeService.getSelectedBadge(playerId)
  return { data: badge }
})
