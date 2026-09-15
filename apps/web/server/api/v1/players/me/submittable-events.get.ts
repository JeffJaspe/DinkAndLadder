import { serverSupabaseServiceRole } from '#supabase/server'
import { createEventCoOrganizerRepository } from '~/server/domains/event/repositories/event-co-organizer.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

const LIMIT = 30

/**
 * Events this player can record a result for: the ones they organise.
 *
 * Results come from the organiser, not the players (see POST /api/v1/matches),
 * so the picker on /matches/submit lists the events this player created. It
 * used to list registrations - the events they had *played* in - which was
 * the rule this replaced.
 *
 * Completed events are deliberately included: a score is almost always entered
 * after the event is over, so filtering them out would hide exactly the events
 * an organiser is still writing up. Cancelled and draft events are not.
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

  const coOrganized = await createEventCoOrganizerRepository(client).listEventIdsByPlayer(
    profile.id
  )

  const { data, error } = await client
    .from('events')
    .select('id, name, start_date, end_date, event_type, status, venue, city')
    // Results are recorded by the organiser, so the picker lists the events
    // this player created or co-organises - not the ones they are registered for.
    .or(
      coOrganized.length
        ? `created_by_player_id.eq.${profile.id},id.in.(${coOrganized.join(',')})`
        : `created_by_player_id.eq.${profile.id}`
    )
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
