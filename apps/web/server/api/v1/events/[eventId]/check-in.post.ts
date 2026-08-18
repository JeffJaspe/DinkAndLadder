import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createEventRegistrationRepository } from '~/server/domains/event/repositories/event-registration.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to check in.')
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
  const registrationRepo = createEventRegistrationRepository(serviceClient)

  const registration = await registrationRepo.findByEventAndPlayer(eventId, playerProfile.id)
  if (!registration) {
    throw apiError(404, 'NOT_REGISTERED', 'You are not registered for this event.')
  }

  if (registration.status === 'withdrawn') {
    throw apiError(409, 'WITHDRAWN', 'You have withdrawn from this event.')
  }

  if (registration.status === 'checked_in') {
    throw apiError(409, 'ALREADY_CHECKED_IN', 'You are already checked in.')
  }

  const { data: eventData } = await serviceClient
    .from('events')
    .select('status')
    .eq('id', eventId)
    .single()

  if (!eventData || eventData.status !== 'active') {
    throw apiError(409, 'EVENT_NOT_ACTIVE', 'Check-in is only available when the event is active.')
  }

  try {
    const updated = await registrationRepo.checkIn(registration.id)

    return {
      data: updated,
      message: 'Successfully checked in',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[POST /api/v1/events/:eventId/check-in] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not check in.')
  }
})
