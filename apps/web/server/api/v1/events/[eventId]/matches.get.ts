import { serverSupabaseClient } from '#supabase/server'
import { apiError } from '~/server/utils/api-error'
import type { MatchJoinRow } from '~/server/domains/match/dto/match-join-row.dto'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID is required.')
  }

  const rawQuery = getQuery(event)
  const status = rawQuery.status as string | undefined
  const limit = Math.min(parseInt(rawQuery.limit as string) || 50, 100)
  const offset = parseInt(rawQuery.offset as string) || 0

  const userClient = await serverSupabaseClient(event)

  let query = userClient
    .from('matches')
    .select(`
      id,
      match_type,
      status,
      event_id,
      affects_rating,
      venue,
      played_at,
      submitted_at,
      verified_at,
      match_participants (
        player_id,
        team_number,
        result_status,
        player_profiles!inner (
          id,
          display_name
        )
      ),
      match_scores (
        set_number,
        team1_score,
        team2_score
      )
    `)
    .eq('event_id', eventId)
    .order('played_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq('status', status)
  }

  const { data: matches, error } = await query

  if (error) {
    console.error('[GET /api/v1/events/:eventId/matches] failed:', error)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load matches.')
  }

  const mapped = (matches ?? []).map((m: MatchJoinRow) => ({
    id: m.id,
    match_type: m.match_type,
    status: m.status,
    event_id: m.event_id,
    affects_rating: m.affects_rating,
    venue: m.venue,
    played_at: m.played_at,
    submitted_at: m.submitted_at,
    verified_at: m.verified_at,
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

  return {
    data: mapped,
    request_id: crypto.randomUUID()
  }
})
