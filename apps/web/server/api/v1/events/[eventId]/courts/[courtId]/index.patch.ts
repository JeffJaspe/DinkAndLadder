import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createEventCourtRepository } from '~/server/domains/event/repositories/event-court.repository'
import { createEventQueueRepository } from '~/server/domains/event/repositories/event-queue.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createEventCourtService,
  EventCourtServiceError
} from '~/server/domains/event/services/event-court.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { assertCanRunEvent } from '~/server/utils/event-organizer'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Rename one court.
 *
 * Deliberately not gated on `assertEventIsRunning` the way scoring is: courts
 * are materialised when the event starts, and labelling them is exactly the
 * setup an organiser wants to do before the first game rather than during it.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to rename a court.')
  }

  const eventId = getRouterParam(event, 'eventId')
  const courtId = getRouterParam(event, 'courtId')
  if (!eventId || !courtId) {
    throw apiError(400, 'VALIDATION_ERROR', 'eventId and courtId are required.')
  }

  type RenameBody = { court_name?: unknown }
  const body: RenameBody = (await readBody<RenameBody>(event).catch(() => undefined)) ?? {}

  if (body.court_name !== null && typeof body.court_name !== 'string') {
    throw apiError(400, 'VALIDATION_ERROR', 'court_name must be a string, or null to clear it.')
  }

  const userClient = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  await assertCanRunEvent(serviceClient, eventId, profile.id)

  const service = createEventCourtService(
    createEventCourtRepository(serviceClient),
    createEventQueueRepository(serviceClient),
    createEventRepository(serviceClient)
  )

  try {
    const court = await service.renameCourt(courtId, body.court_name)
    return { data: court, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof EventCourtServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[PATCH /api/v1/events/${eventId}/courts/${courtId}] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not rename the court.')
  }
})
