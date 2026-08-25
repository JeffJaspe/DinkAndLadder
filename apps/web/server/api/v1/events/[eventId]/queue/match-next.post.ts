import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createEventQueueRepository } from '~/server/domains/event/repositories/event-queue.repository'
import { createEventRegistrationRepository } from '~/server/domains/event/repositories/event-registration.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createEventQueueService,
  EventQueueServiceError
} from '~/server/domains/event/services/event-queue.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Organizer-only: puts the two longest-waiting entries onto a court.
 *
 * The pair is chosen server-side, not sent by the client — see `matchNextPair`.
 * Same service-role rationale as `queue/match.post.ts`: this writes queue rows
 * owned by other players, and the service asserts the caller is the organizer
 * before the bypass is used.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage the queue.')
  }

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID is required.')
  }

  const body = await readBody<{ court_number?: number; match_type?: string }>(event)
  if (typeof body?.court_number !== 'number' || body.court_number < 1) {
    throw apiError(400, 'VALIDATION_ERROR', 'court_number must be a positive number.')
  }
  // Optional: without it the longest wait decides which format goes on next.
  if (
    body.match_type !== undefined &&
    body.match_type !== 'singles' &&
    body.match_type !== 'doubles'
  ) {
    throw apiError(400, 'VALIDATION_ERROR', "match_type must be 'singles' or 'doubles'.")
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
    const result = await service.matchNextPair(
      playerProfile.id,
      eventId,
      body.court_number,
      body.match_type
    )
    return { data: result, message: 'Next pair matched', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof EventQueueServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/events/${eventId}/queue/match-next] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not match the next pair.')
  }
})
