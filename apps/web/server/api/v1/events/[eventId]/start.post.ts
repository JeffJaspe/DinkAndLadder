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
import { createEventCourtRepository } from '~/server/domains/event/repositories/event-court.repository'
import { createEventQueueRepository } from '~/server/domains/event/repositories/event-queue.repository'
import { createEventCourtService } from '~/server/domains/event/services/event-court.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Start a session: published -> active, and open its courts.
 *
 * This transition did not exist. `UpdateEventInput` has no status field, so
 * `'active'` was unreachable through the API - while check-in, the Record Match
 * card and the withdraw/check-in branches all gated on `status === 'active'`.
 * Every one of those paths was dead.
 *
 * Opening the courts here rather than at creation is deliberate: `queue_courts`
 * is editable while an event is a draft, so materialising rows earlier would
 * mean reconciling them every time the organiser changed their mind.
 */
export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to start an event.')
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
  const eventRepo = createEventRepository(serviceClient)
  const service = createEventService(
    eventRepo,
    createTournamentRepository(serviceClient),
    createTournamentRegistrationRepository(serviceClient)
  )

  try {
    const started = await service.startEvent(profile.id, eventId)

    // Courts only make sense for open play. A tournament's structure is its
    // bracket, and giving it a court board would be two competing sources of
    // truth about who is playing.
    let courts = null
    if (started.event_type !== 'tournament') {
      const courtService = createEventCourtService(
        createEventCourtRepository(serviceClient),
        createEventQueueRepository(serviceClient),
        eventRepo
      )
      courts = await courtService.openCourts(eventId)
    }

    return {
      data: started,
      courts,
      message: 'Event started',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    if (err instanceof EventServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/events/${eventId}/start] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not start the event.')
  }
})
