import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
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

/**
 * Deletes a draft event and the tournaments/categories drawn up under it.
 *
 * Writes go through the service-role client because `events` is select-only
 * under RLS — the same pattern the create and publish handlers already use.
 * Authorisation is the service's job: deleteDraftEvent asserts the caller is
 * the organiser, refuses anything that is not a draft, and refuses a draft that
 * somehow has registrations, matches or queue entries attached.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to delete an event.')
  }

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID is required.')
  }

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'A player profile is required.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createEventService(
    createEventRepository(serviceClient),
    createTournamentRepository(serviceClient),
    createTournamentRegistrationRepository(serviceClient)
  )

  try {
    await service.deleteDraftEvent(profile.id, eventId)
    return { message: 'Event deleted', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    console.error(`[DELETE /api/v1/events/${eventId}] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not delete the event.')
  }
})
