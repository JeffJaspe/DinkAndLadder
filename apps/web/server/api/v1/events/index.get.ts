import { serverSupabaseClient } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import { createEventRegistrationRepository } from '~/server/domains/event/repositories/event-registration.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createEventService } from '~/server/domains/event/services/event.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { isFeatureEnabled } from '~/server/utils/feature-flags'
import type { EventSearchQuery } from '~/server/domains/event/dto/event.dto'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Public listing, but a signed-in organiser also gets their own unpublished
 * drafts back so a created-then-unpublished event is still reachable. Anyone
 * else's drafts stay hidden — enforced by RLS (events_select_own), not by this
 * handler.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const client = await serverSupabaseClient(event)

  // Identifying the caller is an enhancement here, not a requirement — it only
  // decides whether their own drafts are included. getOptionalUser hands back
  // null for a bad or clock-skewed token as readily as for no token, so a
  // browser holding a dead cookie still gets the public listing.
  let ownPlayerId: string | undefined
  const claims = await getOptionalUser(event)
  if (claims) {
    const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
    ownPlayerId = profile?.id
  }

  // Gated server-side rather than in the template: with the flag off the field
  // is never attached, so no client — stale bundle, direct API call, or mobile —
  // can surface the badge. See docs/30-SUPER-ADMIN-SPECIFICATION.md §2.5.
  const showRegisteredBadge = await isFeatureEnabled(event, 'events.registered_badge')

  const searchQuery: EventSearchQuery = {
    club_id: query.club_id as string | undefined,
    province: query.province as string | undefined,
    city: query.city as string | undefined,
    // Trimmed and capped: a search term is typed, so it is the one field here
    // a person can make arbitrarily long by holding a key down.
    q: typeof query.q === 'string' ? query.q.trim().slice(0, 100) : undefined,
    status: query.status as EventSearchQuery['status'] | undefined,
    // Comma-separated, because a repeated query param arrives as a string on a
    // single value and an array on several — one shape is easier to trust.
    // Values are checked against the union rather than passed through, since
    // they reach a PostgREST `in` filter.
    event_types:
      typeof query.event_types === 'string'
        ? (query.event_types
            .split(',')
            .map((v) => v.trim())
            .filter((v) =>
              [
                'open_casual',
                'open_ranked',
                'club_casual',
                'club_ranked',
                'tournament',
                'coaching'
              ].includes(v)
            ) as EventSearchQuery['event_types'])
        : undefined,
    include_drafts_for_player_id: ownPlayerId,
    // Same id, second use: it also decides which cards can say "Registered".
    viewer_player_id: showRegisteredBadge ? ownPlayerId : undefined,
    limit: Math.min(parseInt(query.limit as string) || 20, 100),
    offset: parseInt(query.offset as string) || 0
  }

  const service = createEventService(
    createEventRepository(client),
    createTournamentRepository(client),
    createTournamentRegistrationRepository(client),
    undefined,
    // Lets each result carry how many slots are taken, and whether the caller
    // is already in it, without a request per event.
    createEventRegistrationRepository(client)
  )

  try {
    const events = await service.searchEvents(searchQuery)
    return { events }
  } catch (err) {
    console.error('[GET /api/v1/events] searchEvents failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load events.')
  }
})
