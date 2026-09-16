import { serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createBadgeRepository } from '~/server/domains/badge/repositories/badge.repository'
import { createBadgeService } from '~/server/domains/badge/services/badge.service'
import { createAchievementRepository } from '~/server/domains/achievement/repositories/achievement.repository'
import { requireFeature, FEATURE_ACHIEVEMENTS } from '~/server/utils/require-feature'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

/**
 * The badge picker's payload: what this player can show, and what they have
 * chosen.
 *
 * `availableBadges` used to be the hard-coded ten-badge list, identical for
 * every account. It is now the badges they have actually earned, so the picker
 * cannot offer something the profile would then be lying about. `lockedCount`
 * is what is left, which is the honest thing to put behind a link to the
 * gallery rather than a second copy of it in a dashboard card.
 */
export default defineEventHandler(async (event) => {
  // Off means gone, not hidden: the client gate only stops this app
  // rendering it, never a stale bundle or a direct call.
  await requireFeature(event, FEATURE_ACHIEVEMENTS)

  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const supabase = await serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(supabase)
  const achievements = createAchievementRepository(supabase)
  const badgeService = createBadgeService(createBadgeRepository(supabase), achievements)

  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw apiError(404, 'NOT_FOUND', 'Player profile not found.')
  }

  const [showcase, availableBadges, definitions] = await Promise.all([
    badgeService.getShowcase(profile.id),
    badgeService.getEarnedBadges(profile.id),
    achievements.findAllDefinitions()
  ])

  const selectedBadgeId =
    showcase?.selectedBadgeId && availableBadges.some((b) => b.id === showcase.selectedBadgeId)
      ? showcase.selectedBadgeId
      : null

  return {
    data: {
      showcase: showcase ? { ...showcase, selectedBadgeId } : null,
      availableBadges,
      lockedCount: Math.max(definitions.length - availableBadges.length, 0)
    }
  }
})
