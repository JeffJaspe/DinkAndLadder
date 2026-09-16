import { serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createBadgeRepository } from '~/server/domains/badge/repositories/badge.repository'
import {
  BadgeServiceError,
  createBadgeService
} from '~/server/domains/badge/services/badge.service'
import { createAchievementRepository } from '~/server/domains/achievement/repositories/achievement.repository'
import { requireFeature, FEATURE_ACHIEVEMENTS } from '~/server/utils/require-feature'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

interface SetBadgeBody {
  /** The achievement key to show, or null to clear the profile badge. */
  badge_id: string | null
}

export default defineEventHandler(async (event) => {
  // Off means gone, not hidden: the client gate only stops this app
  // rendering it, never a stale bundle or a direct call.
  await requireFeature(event, FEATURE_ACHIEVEMENTS)

  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const body = await readBody<SetBadgeBody>(event)
  const badgeId = body?.badge_id ?? null
  if (badgeId !== null && typeof badgeId !== 'string') {
    throw apiError(400, 'VALIDATION_ERROR', 'badge_id must be an achievement key or null.')
  }

  const supabase = await serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(supabase)
  const badgeService = createBadgeService(
    createBadgeRepository(supabase),
    createAchievementRepository(supabase)
  )

  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw apiError(404, 'NOT_FOUND', 'Player profile not found.')
  }

  try {
    // The ownership check is here in the service, not in the client that
    // offered the choice. Selecting a badge is a claim about the player's
    // record, so it is verified against the record on every write.
    const showcase = await badgeService.setSelectedBadge(profile.id, badgeId)
    return { data: showcase }
  } catch (err) {
    if (err instanceof BadgeServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
