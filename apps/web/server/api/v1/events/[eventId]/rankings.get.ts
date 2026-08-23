import { serverSupabaseClient } from '#supabase/server'
import { apiError } from '~/server/utils/api-error'

interface AggregateRow {
  player_id: string
  display_name: string
  matches_played: number
  wins: number
  losses: number
}

/**
 * User-scoped client only — matches_select_event RLS (008-security.changelog.xml) already
 * restricts which of this event's matches the caller can see, so this naturally returns an
 * empty leaderboard for a non-public event the caller isn't registered to. Deliberately
 * excludes rating change: rating_transactions is "select own" only (see the note on
 * players/me/rating-history.get.ts), so a shared leaderboard has no RLS-safe way to show
 * another player's rating delta without a service-role bypass this endpoint doesn't have a
 * documented reason to take.
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

  interface EventRankingMatchRow {
    match_scores?: Array<{ set_number: number; team1_score: number; team2_score: number }> | null
    match_participants?: Array<{
      player_id: string
      team_number: 1 | 2
      player_profiles: { id: string; display_name: string } | null
    }> | null
  }

  const byPlayer = new Map<string, AggregateRow>()

  for (const m of matches ?? []) {
    const row = m as unknown as EventRankingMatchRow
    const scores = row.match_scores ?? []
    const participants = row.match_participants ?? []
    if (scores.length === 0 || participants.length === 0) continue

    const team1Sets = scores.filter((s) => s.team1_score > s.team2_score).length
    const team2Sets = scores.filter((s) => s.team2_score > s.team1_score).length
    const winningTeam = team1Sets > team2Sets ? 1 : team2Sets > team1Sets ? 2 : null
    if (winningTeam === null) continue

    for (const p of participants) {
      const displayName = p.player_profiles?.display_name ?? 'Unknown'
      const row = byPlayer.get(p.player_id) ?? {
        player_id: p.player_id,
        display_name: displayName,
        matches_played: 0,
        wins: 0,
        losses: 0
      }
      row.matches_played += 1
      if (p.team_number === winningTeam) row.wins += 1
      else row.losses += 1
      byPlayer.set(p.player_id, row)
    }
  }

  const ranked = [...byPlayer.values()]
    .sort((a, b) => b.wins - a.wins || b.matches_played - a.matches_played)
    .map((row, i) => ({ rank: i + 1, ...row }))

  return { data: ranked, request_id: crypto.randomUUID() }
})
