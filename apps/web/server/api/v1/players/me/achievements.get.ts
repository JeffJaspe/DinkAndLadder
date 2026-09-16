import { serverSupabaseServiceRole } from '#supabase/server'
import { createAchievementRepository } from '~/server/domains/achievement/repositories/achievement.repository'
import { createAchievementStatsRepository } from '~/server/domains/achievement/repositories/achievement-stats.repository'
import { createAchievementGalleryService } from '~/server/domains/achievement/services/achievement-gallery.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { requireFeature, FEATURE_ACHIEVEMENTS } from '~/server/utils/require-feature'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

/**
 * The player's own achievement gallery: every earnable badge, marked earned or
 * locked, with the requirement and progress on the locked ones.
 *
 * This replaced a payload of only the achievements they held, which the page
 * then had to join against `/api/v1/achievements` to work out what was missing
 * — and which could say nothing at all about how close they were. Progress has
 * to come from the server because it is read from the same stats the unlock
 * decision uses; computing it client-side would be a second implementation of
 * the rules, free to disagree with the one that grants the badge.
 *
 * Service role: the requirements read across club_memberships, player_ratings
 * and tournament brackets, several of which are not readable by their own owner
 * under RLS. The player id comes from the verified token, so the widened client
 * only ever gathers stats for the caller.
 */
export default defineEventHandler(async (event) => {
  // Off means gone, not hidden: the client gate only stops this app
  // rendering it, never a stale bundle or a direct call.
  await requireFeature(event, FEATURE_ACHIEVEMENTS)

  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const client = serverSupabaseServiceRole(event)

  const profile = await createPlayerProfileRepository(client).findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const gallery = createAchievementGalleryService(
    createAchievementRepository(client),
    createAchievementStatsRepository(client)
  )

  try {
    return { data: await gallery.forPlayer(profile.id, user.sub) }
  } catch (err) {
    console.error('[GET /api/v1/players/me/achievements] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load your achievements.')
  }
})
