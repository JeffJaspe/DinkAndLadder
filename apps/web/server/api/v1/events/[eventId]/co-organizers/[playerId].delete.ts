import { serverSupabaseClient } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { EventServiceError } from '~/server/domains/event/services/event.service'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'
import { buildCoOrganizerService, listCoOrganizerDtos } from '~/server/utils/co-organizers'

/** Remove a co-organiser. Creator only. */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage co-organisers.')

  const eventId = getRouterParam(event, 'eventId')
  const playerId = getRouterParam(event, 'playerId')
  if (!eventId || !playerId) {
    throw apiError(400, 'VALIDATION_ERROR', 'eventId and playerId are required.')
  }

  const profile = await createPlayerProfileRepository(
    await serverSupabaseClient(event)
  ).findByUserId(claims.sub)
  if (!profile) throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')

  const { service } = buildCoOrganizerService(event)
  try {
    await service.remove(profile.id, eventId, playerId)
  } catch (err) {
    if (err instanceof EventServiceError) throw apiError(err.status, err.code, err.message)
    throw err
  }
  return { data: await listCoOrganizerDtos(event, eventId), message: 'Co-organiser removed' }
})
