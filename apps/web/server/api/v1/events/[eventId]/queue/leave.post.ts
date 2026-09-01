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

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to leave the queue.')
  }

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID is required.')
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
    await service.leaveQueue(eventId, playerProfile.id)
    return { message: 'Left the queue', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof EventQueueServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/events/${eventId}/queue/leave] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not leave the queue.')
  }
})
