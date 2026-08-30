import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createEventCourtRepository } from '~/server/domains/event/repositories/event-court.repository'
import { createEventQueueRepository } from '~/server/domains/event/repositories/event-queue.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createEventCourtService,
  EventCourtServiceError
} from '~/server/domains/event/services/event-court.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { assertCanRunEvent, assertEventIsRunning } from '~/server/utils/event-organizer'
import { apiError } from '~/server/utils/api-error'

/**
 * Put two sides on a court and start the game.
 *
 * Per court, not per event: courts free up one at a time, and an organiser
 * standing at the desk starts court 3 while courts 1 and 2 are mid-game.
 *
 * Service role because this writes queue rows belonging to other players; the
 * caller is checked against the organiser/club-staff rule first.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to run a court.')
  }

  const eventId = getRouterParam(event, 'eventId')
  const courtId = getRouterParam(event, 'courtId')
  if (!eventId || !courtId) {
    throw apiError(400, 'VALIDATION_ERROR', 'eventId and courtId are required.')
  }

  type StartBody = { team1_queue_id?: unknown; team2_queue_id?: unknown }
  const body: StartBody = (await readBody<StartBody>(event).catch(() => undefined)) ?? {}

  if (typeof body.team1_queue_id !== 'string' || typeof body.team2_queue_id !== 'string') {
    throw apiError(400, 'VALIDATION_ERROR', 'Pick both sides before starting the court.')
  }

  const userClient = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const eventRow = await assertCanRunEvent(serviceClient, eventId, profile.id)
  assertEventIsRunning(eventRow)

  const service = createEventCourtService(
    createEventCourtRepository(serviceClient),
    createEventQueueRepository(serviceClient),
    createEventRepository(serviceClient)
  )

  try {
    const court = await service.startCourt(courtId, {
      team1_queue_id: body.team1_queue_id,
      team2_queue_id: body.team2_queue_id
    })
    return { data: court, message: 'Court started', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof EventCourtServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/events/${eventId}/courts/${courtId}/start] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not start the court.')
  }
})
