import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import type { MatchJoinRow } from '~/server/domains/match/dto/match-join-row.dto'

/**
 * User-scoped client only — matches_select_participant RLS (008-security.changelog.xml)
 * already restricts rows to matches the caller played in; the explicit player_id filter here
 * is just so the query only touches this player's own match_participants rows.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your matches.')
  }

  const limit = Math.min(parseInt(getQuery(event).limit as string) || 5, 50)

  const client = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const { data: participantRows, error: participantError } = await client
    .from('match_participants')
    .select('match_id')
    .eq('player_id', playerProfile.id)

  if (participantError) {
    console.error('[GET /api/v1/players/me/matches] failed:', participantError)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load your matches.')
  }

  const matchIds = [...new Set((participantRows ?? []).map((r) => r.match_id))]
  if (matchIds.length === 0) {
    return { data: [], request_id: crypto.randomUUID() }
  }

  const { data: matches, error } = await client
    .from('matches')
    .select(`
      id,
      match_type,
      status,
      event_id,
      affects_rating,
      played_at,
      match_participants (
        player_id,
        team_number,
        result_status,
        player_profiles!inner (id, display_name)
      ),
      match_scores (set_number, team1_score, team2_score)
    `)
    .in('id', matchIds)
    .order('played_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[GET /api/v1/players/me/matches] failed:', error)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load your matches.')
  }

  const mapped = (matches ?? []).map((m: MatchJoinRow) => ({
    id: m.id,
    match_type: m.match_type,
    status: m.status,
    event_id: m.event_id,
    affects_rating: m.affects_rating,
    played_at: m.played_at,
    participants: (m.match_participants ?? []).map((p) => ({
      player_id: p.player_id,
      team_number: p.team_number,
      result_status: p.result_status,
      display_name: p.player_profiles?.display_name
    })),
    scores: (m.match_scores ?? [])
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => ({
        set_number: s.set_number,
        team1_score: s.team1_score,
        team2_score: s.team2_score
      }))
  }))

  return { data: mapped, request_id: crypto.randomUUID() }
})
