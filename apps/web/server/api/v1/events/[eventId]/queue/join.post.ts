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
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to join the queue.')
  }

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID is required.')
  }

  const body = await readBody<{ match_type?: string; partner_id?: string | null }>(event)
  if (body?.match_type !== 'singles' && body?.match_type !== 'doubles') {
    throw apiError(400, 'VALIDATION_ERROR', "match_type must be 'singles' or 'doubles'.")
  }

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(
      409,
      'PLAYER_PROFILE_REQUIRED',
      'Complete your player profile before joining the queue.'
    )
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createEventQueueService(
    createEventQueueRepository(serviceClient),
    createEventRegistrationRepository(serviceClient),
    createEventRepository(serviceClient)
  )

  try {
    const entry = await service.joinQueue(
      eventId,
      playerProfile.id,
      body.match_type,
      body.partner_id ?? null
    )
    return { data: entry, message: 'Joined the queue', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof EventQueueServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/events/${eventId}/queue/join] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not join the queue.')
  }
})
