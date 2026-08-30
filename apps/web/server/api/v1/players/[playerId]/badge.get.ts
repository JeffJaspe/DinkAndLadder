import { serverSupabaseServiceRole } from '#supabase/server'
import { createBadgeRepository } from '~/server/domains/badge/repositories/badge.repository'
import { createBadgeService } from '~/server/domains/badge/services/badge.service'
import { getBadgeById } from '~/server/domains/badge/dto/badge.dto'
import { requireFeature, FEATURE_ACHIEVEMENTS } from '~/server/utils/require-feature'

export default defineEventHandler(async (event) => {
  // Off means gone, not hidden: the client gate only stops this app
  // rendering it, never a stale bundle or a direct call.
  await requireFeature(event, FEATURE_ACHIEVEMENTS)

  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw createError({ statusCode: 400, statusMessage: 'Player ID required' })
  }

  const supabase = await serverSupabaseServiceRole(event)
  const badgeRepo = createBadgeRepository(supabase)
  const badgeService = createBadgeService(badgeRepo)

  const showcase = await badgeService.getShowcase(playerId)

  if (!showcase?.selectedBadgeId) {
    return { data: null }
  }

  const badge = getBadgeById(showcase.selectedBadgeId)
  return {
    data: badge ? { ...badge, selectedAt: showcase.updatedAt } : null
  }
})
