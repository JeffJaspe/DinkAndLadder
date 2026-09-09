import { serverSupabaseClient } from '#supabase/server'
import { buildStandings } from '~/server/domains/event/services/event-standings'
import type { StandingsMatch } from '~/server/domains/event/services/event-standings'
import { apiError } from '~/server/utils/api-error'

/**
 * User-scoped client only — matches_select_event RLS (008-security.changelog.xml) already
 * restricts which of this event's matches the caller can see, so this naturally returns an
 * empty leaderboard for a non-public event the caller isn't registered to. Deliberately
 * excludes rating change: rating_transactions is "select own" only (see the note on
 * players/me/rating-history.get.ts), so a shared leaderboard has no RLS-safe way to show
 * another player's rating delta without a service-role bypass this endpoint doesn't have a
 * documented reason to take.
 *
 * How the table is built and ordered lives in `event-standings`, not here: a
 * controller deciding who is top of a leaderboard is business logic in the
 * wrong layer, and it left the ordering untested.
 */
export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID is required.')
  }

  const client = await serverSupabaseClient(event)

  const { data: matches, error } = await client
    .from('matches')
    .select(
      `
      id,
      match_participants (
        player_id,
        team_number,
        player_profiles!inner (id, display_name)
      ),
      match_scores (set_number, team1_score, team2_score)
    `
    )
    .eq('event_id', eventId)
    .eq('status', 'verified')

  if (error) {
    console.error('[GET /api/v1/events/:eventId/rankings] failed:', error)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load event rankings.')
  }

  const ranked = buildStandings((matches ?? []) as unknown as StandingsMatch[])

  return { data: ranked, request_id: crypto.randomUUID() }
})
