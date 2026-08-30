import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createShoutoutRepository } from '~/server/domains/shoutout/repositories/shoutout.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Events this player may attach to a shout-out: ones they created, and ones
 * they hold a live registration for.
 *
 * The same rule is enforced again in ShoutoutService.validateEventLink. This
 * endpoint only exists so the composer can offer a list instead of asking
 * someone to paste an id - it is a convenience, never the check.
 *
 * Past events are excluded: a shout-out lives 24 hours, so pointing it at
 * something that already happened is never what was meant.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to see your events.')
  }

  const client = serverSupabaseServiceRole(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const ids = [...(await createShoutoutRepository(client).listLinkableEventIds(profile.id))]
  if (ids.length === 0) {
    return { data: [], request_id: crypto.randomUUID() }
  }

  // Yesterday rather than now: an event running today should still be
  // attachable at 9pm, and start_date alone cannot say when it ends.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data, error } = await client
    .from('events')
    .select('id, name, start_date, event_type, status')
    .in('id', ids)
    .neq('status', 'cancelled')
    .gte('start_date', cutoff)
    .order('start_date', { ascending: true })
    .limit(25)

  if (error) {
    console.error('[GET /api/v1/players/me/linkable-events] failed:', error)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load your events.')
  }

  return { data: data ?? [], request_id: crypto.randomUUID() }
})
