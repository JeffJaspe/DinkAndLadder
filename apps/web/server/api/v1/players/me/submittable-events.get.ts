import { serverSupabaseServiceRole } from '#supabase/server'
import { createEventRegistrationRepository } from '~/server/domains/event/repositories/event-registration.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

const LIMIT = 30

/**
 * Events this player can submit a match from: the ones they actually played in.
 *
 * `/matches/submit` used to require an `?event=` id in the URL and offered no
 * way to find one — arriving without it showed "you need to submit matches from
 * within an active event" and a link to the full event list, which is not the
 * same question. This is what the picker reads.
 *
 * A live registration is the rule, not organiser-ship: submitting a score is
 * something a participant does. An organiser who did not play has the draw
 * result path instead, which records and verifies in one step.
 *
 * `withdrawn` registrations are excluded — someone who pulled out did not play.
 * Completed events are deliberately included: a score is almost always entered
 * after the event is over, so filtering them out would hide exactly the events
 * people come here to submit for. Cancelled and draft events are excluded,
 * since neither ever happened.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to see your events.')
  }

  const client = serverSupabaseServiceRole(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const registrations = await createEventRegistrationRepository(client).findByPlayer(profile.id)
  const eventIds = [
    ...new Set(
      registrations
        .filter((r) => r.status === 'registered' || r.status === 'checked_in')
        .map((r) => r.event_id)
    )
  ]

  if (eventIds.length === 0) {
    return { data: [], request_id: crypto.randomUUID() }
  }

  const { data, error } = await client
    .from('events')
    .select('id, name, start_date, end_date, event_type, status, venue, city')
    .in('id', eventIds)
    .not('status', 'in', '("cancelled","draft")')
    // Most recent first: the event you just played is the one you are here for.
    .order('start_date', { ascending: false })
    .limit(LIMIT)

  if (error) {
    console.error('[GET /api/v1/players/me/submittable-events] failed:', error)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load your events.')
  }

  return { data: data ?? [], request_id: crypto.randomUUID() }
})
