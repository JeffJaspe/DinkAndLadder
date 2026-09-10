import { serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createBadgeRepository } from '~/server/domains/badge/repositories/badge.repository'
import { createBadgeService } from '~/server/domains/badge/services/badge.service'
import { requireFeature, FEATURE_ACHIEVEMENTS } from '~/server/utils/require-feature'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

interface SetBadgeBody {
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

  const supabase = await serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(supabase)
  const badgeRepo = createBadgeRepository(supabase)
  const badgeService = createBadgeService(badgeRepo)

  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw apiError(404, 'NOT_FOUND', 'Player profile not found.')
  }

  try {
    const showcase = await badgeService.setSelectedBadge(profile.id, body.badge_id)
    return { data: showcase }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Invalid badge ID')) {
      throw apiError(400, 'INVALID_INPUT', err.message)
    }
    throw err
  }
})
