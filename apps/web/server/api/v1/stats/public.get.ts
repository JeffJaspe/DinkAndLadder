import { serverSupabaseServiceRole } from '#supabase/server'

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

  return {
    data: {
      players: playersResult.count ?? 0,
      matches: matchesResult.count ?? 0,
      clubs: clubsResult.count ?? 0,
      events: eventsResult.count ?? 0
    }
  }
})
