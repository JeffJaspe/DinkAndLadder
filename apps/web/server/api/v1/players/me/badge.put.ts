import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createBadgeRepository } from '~/server/domains/badge/repositories/badge.repository'
import { createBadgeService } from '~/server/domains/badge/services/badge.service'

interface SetBadgeBody {
  badge_id: string | null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<SetBadgeBody>(event)

  const supabase = await serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(supabase)
  const badgeRepo = createBadgeRepository(supabase)
  const badgeService = createBadgeService(badgeRepo)

  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 404, statusMessage: 'Player profile not found' })
  }

  try {
    const showcase = await badgeService.setSelectedBadge(profile.id, body.badge_id)
    return { data: showcase }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Invalid badge ID')) {
      throw createError({ statusCode: 400, statusMessage: err.message })
    }
    throw err
  }
})
