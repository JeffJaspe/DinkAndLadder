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
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to register for events.')
  }

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID is required.')
  }

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(
      409,
      'PLAYER_PROFILE_REQUIRED',
      'Complete your player profile before registering for events.'
    )
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const registrationRepo = createEventRegistrationRepository(serviceClient)

  const existing = await registrationRepo.findByEventAndPlayer(eventId, playerProfile.id)
  if (existing && existing.status !== 'withdrawn') {
    throw apiError(409, 'ALREADY_REGISTERED', 'You are already registered for this event.')
  }

  const { data: eventData, error: eventError } = await serviceClient
    .from('events')
    .select('id, status, max_participants, event_type, club_id')
    .eq('id', eventId)
    .single()

  if (eventError || !eventData) {
    throw apiError(404, 'NOT_FOUND', 'Event not found.')
  }

  if (eventData.status !== 'published' && eventData.status !== 'active') {
    throw apiError(409, 'EVENT_NOT_OPEN', 'This event is not open for registration.')
  }

  if (eventData.event_type === 'club_casual' || eventData.event_type === 'club_ranked') {
    const { data: membership } = await serviceClient
      .from('club_memberships')
      .select('id, status')
      .eq('club_id', eventData.club_id)
      .eq('player_id', playerProfile.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      throw apiError(403, 'NOT_CLUB_MEMBER', 'This event is for club members only.')
    }
  }

  if (eventData.max_participants) {
    const currentCount = await registrationRepo.countByEvent(eventId, ['registered', 'checked_in'])
    if (currentCount >= eventData.max_participants) {
      throw apiError(409, 'EVENT_FULL', 'This event has reached maximum capacity.')
    }
  }

  try {
    const registration = await registrationRepo.create({
      event_id: eventId,
      player_id: playerProfile.id,
      status: 'registered'
    })

    return {
      data: registration,
      message: 'Successfully registered for event',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[POST /api/v1/events/:eventId/register] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not register for the event.')
  }
})
