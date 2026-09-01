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
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage the queue.')
  }

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID is required.')
  }

  const body = await readBody<{ queue_id?: string }>(event)
  if (typeof body?.queue_id !== 'string') {
    throw apiError(400, 'VALIDATION_ERROR', 'queue_id is required.')
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
    const entry = await service.skipEntry(playerProfile.id, eventId, body.queue_id)
    return { data: entry, message: 'Queue entry skipped', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof EventQueueServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/events/${eventId}/queue/skip] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not skip this queue entry.')
  }
})
