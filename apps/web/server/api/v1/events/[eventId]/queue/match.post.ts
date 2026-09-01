import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createEventQueueRepository } from '~/server/domains/event/repositories/event-queue.repository'
import { createEventRegistrationRepository } from '~/server/domains/event/repositories/event-registration.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createEventQueueService,
  EventQueueServiceError
} from '~/server/domains/event/services/event-queue.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Organizer-only: pairs two waiting queue entries onto a court. Uses the service-role client
 * because this writes to queue rows owned by OTHER players (same rationale as the rest of the
 * event/match domain's cross-player writes) — EventQueueService checks the caller is the
 * event's organizer before the bypass is used.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage the queue.')
  }

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID is required.')
  }

  const body = await readBody<{ queue_id_1?: string; queue_id_2?: string; court_number?: number }>(
    event
  )
  if (typeof body?.queue_id_1 !== 'string' || typeof body?.queue_id_2 !== 'string') {
    throw apiError(400, 'VALIDATION_ERROR', 'queue_id_1 and queue_id_2 are required.')
  }
  if (typeof body?.court_number !== 'number' || body.court_number < 1) {
    throw apiError(400, 'VALIDATION_ERROR', 'court_number must be a positive number.')
  }

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createEventQueueService(
    createEventQueueRepository(serviceClient),
    createEventRegistrationRepository(serviceClient),
    createEventRepository(serviceClient)
  )

  try {
    const result = await service.matchEntries(
      playerProfile.id,
      eventId,
      body.queue_id_1,
      body.queue_id_2,
      body.court_number
    )
    return { data: result, message: 'Players matched', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof EventQueueServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/events/${eventId}/queue/match] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not match these players.')
  }
})
