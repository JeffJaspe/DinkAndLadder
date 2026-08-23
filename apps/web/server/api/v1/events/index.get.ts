import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import { createEventRegistrationRepository } from '~/server/domains/event/repositories/event-registration.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createEventService } from '~/server/domains/event/services/event.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import type { EventSearchQuery } from '~/server/domains/event/dto/event.dto'

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
  // decides whether their own drafts are included. serverSupabaseUser throws on
  // a bad or clock-skewed token, so a failure must degrade to the public
  // listing rather than take the whole events page down.
  let ownPlayerId: string | undefined
  try {
    const claims = await serverSupabaseUser(event)
    if (claims) {
      const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
      ownPlayerId = profile?.id
    }
  } catch (err) {
    console.warn('[GET /api/v1/events] could not identify caller, showing public events only:', err)
  }

  const searchQuery: EventSearchQuery = {
    club_id: query.club_id as string | undefined,
    province: query.province as string | undefined,
    city: query.city as string | undefined,
    status: query.status as EventSearchQuery['status'] | undefined,
    include_drafts_for_player_id: ownPlayerId,
    limit: Math.min(parseInt(query.limit as string) || 20, 100),
    offset: parseInt(query.offset as string) || 0
  }

  const service = createEventService(
    createEventRepository(client),
    createTournamentRepository(client),
    createTournamentRegistrationRepository(client),
    undefined,
    // Lets each result carry how many slots are taken, so a card can show
    // "4 of 16 slots left" without a request per event.
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
