import { serverSupabaseServiceRole } from '#supabase/server'
import { apiError } from '~/server/utils/api-error'

/**
 * Public landing-page counters.
 *
 * Every count is checked: this endpoint used to do `count ?? 0` and swallow the
 * error, so a rejected service-role key (as happened in prod on 2026-08-28)
 * showed as four honest-looking zeros with an HTTP 200. A broken key must look
 * broken.
 */
export default defineEventHandler(async (event) => {
  const client = serverSupabaseServiceRole(event)

  // Get counts from database
  const [playersResult, matchesResult, clubsResult, eventsResult] = await Promise.all([
    client.from('player_profiles').select('id', { count: 'exact', head: true }),
    client.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
    client.from('clubs').select('id', { count: 'exact', head: true }),
    client
      .from('events')
      .select('id', { count: 'exact', head: true })
      .in('status', ['published', 'completed'])
  ])

  const failed = [
    ['players', playersResult],
    ['matches', matchesResult],
    ['clubs', clubsResult],
    ['events', eventsResult]
  ].filter(([, result]) => (result as { error: unknown }).error)

  if (failed.length > 0) {
    for (const [name, result] of failed) {
      console.error(
        `[GET /api/v1/stats/public] ${name} count failed:`,
        (result as { error: unknown }).error
      )
    }
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load platform statistics.')
  }

  return {
    data: {
      players: playersResult.count ?? 0,
      matches: matchesResult.count ?? 0,
      clubs: clubsResult.count ?? 0,
      events: eventsResult.count ?? 0
    }
  }
})
