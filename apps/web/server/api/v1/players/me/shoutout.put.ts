import { serverSupabaseServiceRole } from '#supabase/server'
import { createShoutoutRepository } from '~/server/domains/shoutout/repositories/shoutout.repository'
import {
  createShoutoutService,
  ShoutoutServiceError
} from '~/server/domains/shoutout/services/shoutout.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createActivityRepository } from '~/server/domains/activity/repositories/activity.repository'
import { createActivityLogger } from '~/server/domains/activity/services/activity.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to edit your shout-out.')
  }

  const client = serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(claims.sub)

  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const body = await readBody(event)
  if (typeof body !== 'object' || !body.message) {
    throw apiError(400, 'VALIDATION_ERROR', 'message is required.')
  }

  const activityLogger = createActivityLogger(createActivityRepository(client))
  const service = createShoutoutService(createShoutoutRepository(client), activityLogger)

  try {
    const shoutout = await service.update(profile.id, {
      message: body.message,
      // Validated against the player's own events in the service, not here -
      // the endpoint has no business knowing what makes an event linkable.
      event_id: typeof body?.event_id === 'string' && body.event_id ? body.event_id : null
    })
    return { data: shoutout }
  } catch (err) {
    if (err instanceof ShoutoutServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
