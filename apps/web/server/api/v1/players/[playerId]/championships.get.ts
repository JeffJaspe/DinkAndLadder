import { serverSupabaseServiceRole } from '#supabase/server'
import { createChampionshipService } from '~/server/domains/achievement/services/championship.service'
import { requireFeature, FEATURE_ACHIEVEMENTS } from '~/server/utils/require-feature'
import { apiError } from '~/server/utils/api-error'

/**
 * Every tournament title this player holds, most recent first.
 *
 * Separate from the badge showcase: the showcase is one badge the player chose,
 * while this is the list of things that actually happened. A player with four
 * titles gets four badges on their profile, each linking to the draw it was won
 * in — a single "Tournament Champion" glyph cannot say which tournament, and
 * that was the only interesting part.
 *
 * Public, like the profile it decorates. Service role because the derivation
 * reads across `bracket_matches`, `tournaments` and `tournament_categories`,
 * whose RLS admits the people in the draw rather than any reader; the response
 * carries nothing beyond the names and ids the event page already shows to
 * anyone who can open it.
 */
export default defineEventHandler(async (event) => {
  // Off means gone, not hidden: the client gate only stops this app
  // rendering it, never a stale bundle or a direct call.
  await requireFeature(event, FEATURE_ACHIEVEMENTS)

  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw apiError(400, 'INVALID_INPUT', 'Player ID required.')
  }

  const client = serverSupabaseServiceRole(event)

  try {
    return { data: await createChampionshipService(client).championshipsFor(playerId) }
  } catch (err) {
    console.error(`[GET /api/v1/players/${playerId}/championships] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load championships.')
  }
})
