import { serverSupabaseClient } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { toPlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw createError({ statusCode: 400, statusMessage: 'playerId is required' })
  }

  const client = await serverSupabaseClient(event)
  const repo = createPlayerProfileRepository(client)

  const profile = await repo.findById(playerId)
  if (!profile) {
    throw createError({ statusCode: 404, statusMessage: 'Player not found' })
  }

  if (profile.profile_visibility !== 'public') {
    throw createError({ statusCode: 403, statusMessage: 'Profile is private' })
  }

  return toPlayerProfileDto(profile)
})
