import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import {
  createEventService,
  EventServiceError
} from '~/server/domains/event/services/event.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * End a session: active -> completed.
 *
 * The counterpart to /start. Also what frees an unverified club's single
 * live-event allowance (assertWithinClubLimits) - without it a club that ran one
 * session could never publish another, because nothing ever moved an event out
 * of the live states.
 */
export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to end an event.')
  }

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'eventId is required.')
  }

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'FORBIDDEN', 'Player profile required.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createEventService(
    createEventRepository(serviceClient),
    createTournamentRepository(serviceClient),
    createTournamentRegistrationRepository(serviceClient)
  )

  try {
    const completed = await service.completeEvent(profile.id, eventId)
    return { data: completed, message: 'Event completed', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof EventServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/events/${eventId}/complete] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not complete the event.')
  }
})
