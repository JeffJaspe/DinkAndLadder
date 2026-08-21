import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createShoutoutRepository } from '~/server/domains/shoutout/repositories/shoutout.repository'
import { createShoutoutService } from '~/server/domains/shoutout/services/shoutout.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your shout-out.')
  }

  const client = serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(claims.sub)

  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const service = createShoutoutService(createShoutoutRepository(client))
  const shoutout = await service.getActive(profile.id)

  return { data: shoutout }
})
