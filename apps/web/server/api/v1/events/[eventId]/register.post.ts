import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createEventRegistrationRepository } from '~/server/domains/event/repositories/event-registration.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createTeamUpRepository } from '~/server/domains/partnership/repositories/team-up.repository'
import {
  createTeamUpService,
  TeamUpServiceError
} from '~/server/domains/partnership/services/team-up.service'
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

  /**
   * Open play can be entered for several people at once — you turn up with
   * three from your team and enter them all. `player_ids` names those extras;
   * omitting it registers only the caller, which is what every existing client
   * does.
   */
  const body = await readBody<{ player_ids?: string[] }>(event).catch(() => undefined)
  const requested = Array.isArray(body?.player_ids) ? body.player_ids : []

  // The caller is always in, and the set dedupes a client that sends them twice.
  const everyone = [...new Set([playerProfile.id, ...requested])]

  // Consent: registering somebody commits their evening, so it takes an
  // accepted team-up. Self-registration needs no permission and is skipped.
  if (everyone.length > 1) {
    const teamService = createTeamUpService(createTeamUpRepository(serviceClient))
    try {
      await teamService.assertCanRegister(playerProfile.id, everyone)
    } catch (err) {
      if (err instanceof TeamUpServiceError) throw apiError(err.status, err.code, err.message)
      throw err
    }
  }

  for (const playerId of everyone) {
    const existing = await registrationRepo.findByEventAndPlayer(eventId, playerId)
    if (existing && existing.status !== 'withdrawn') {
      throw apiError(
        409,
        'ALREADY_REGISTERED',
        playerId === playerProfile.id
          ? 'You are already registered for this event.'
          : 'One of the players you selected is already registered for this event.'
      )
    }
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
    // The whole group has to fit, not just the first of them — otherwise
    // entering four into two remaining places half-succeeds.
    if (currentCount + everyone.length > eventData.max_participants) {
      const left = Math.max(0, eventData.max_participants - currentCount)
      throw apiError(
        409,
        'EVENT_FULL',
        everyone.length > 1
          ? `Only ${left} ${left === 1 ? 'place is' : 'places are'} left — you tried to enter ${everyone.length}.`
          : 'This event has reached maximum capacity.'
      )
    }
  }

  try {
    const registrations = []
    for (const playerId of everyone) {
      registrations.push(
        await registrationRepo.create({
          event_id: eventId,
          player_id: playerId,
          status: 'registered',
          // Null for the caller's own row: they registered themselves, and
          // recording them as their own registrar would be noise.
          registered_by_player_id: playerId === playerProfile.id ? null : playerProfile.id
        })
      )
    }

    return {
      data: registrations[0],
      registrations,
      message:
        registrations.length > 1
          ? `Registered ${registrations.length} players for the event`
          : 'Successfully registered for event',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[POST /api/v1/events/:eventId/register] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not register for the event.')
  }
})
