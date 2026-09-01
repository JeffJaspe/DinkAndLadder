import { serverSupabaseClient } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import type { MatchJoinRow } from '~/server/domains/match/dto/match-join-row.dto'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * User-scoped client only — matches_select_participant RLS (008-security.changelog.xml)
 * already restricts rows to matches the caller played in; the explicit player_id filter here
 * is just so the query only touches this player's own match_participants rows.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your matches.')
  }

  const rawQuery = getQuery(event)
  const limit = Math.min(parseInt(rawQuery.limit as string) || 5, 50)
  const offset = Math.max(parseInt(rawQuery.offset as string) || 0, 0)

  /**
   * Optional date window, both ends inclusive.
   *
   * Applied in the query rather than after the fact: filtering the page that
   * happened to load is not filtering, and with a page size it would silently
   * narrow to whatever the first page contained.
   */
  const from = typeof rawQuery.from === 'string' && rawQuery.from ? rawQuery.from : null
  const to = typeof rawQuery.to === 'string' && rawQuery.to ? rawQuery.to : null

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
    .select(
      `
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
    `
    )
    .in('id', matchIds)
    .gte('played_at', from ?? '1970-01-01')
    .lte('played_at', to ? `${to}T23:59:59.999Z` : '9999-12-31')
    .order('played_at', { ascending: false })
    // id breaks the tie so paging is stable: several matches in one session
    // share a played_at, and an unstable sort lets a page boundary repeat or
    // skip a row.
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)

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

  /**
   * What each match did to this player's rating.
   *
   * One extra query for the whole page rather than one per match. The delta is
   * read from the transaction the rating engine wrote, never recomputed here —
   * recomputing would be a second implementation of the algorithm and the two
   * would drift.
   *
   * A match with no row simply has no delta: unrated events, and anything
   * verified before the engine could see it (see the rating backfill).
   */
  const { data: deltas } = await client
    .from('rating_transactions')
    .select('match_id, rating_delta, new_rating')
    .eq('player_id', playerProfile.id)
    .in('match_id', matchIds)

  const deltaByMatch = new Map(
    (deltas ?? []).map((row) => [
      row.match_id as string,
      { rating_delta: row.rating_delta as number, new_rating: row.new_rating as number }
    ])
  )

  const withRatings = mapped.map((m) => ({
    ...m,
    rating_delta: deltaByMatch.get(m.id)?.rating_delta ?? null,
    new_rating: deltaByMatch.get(m.id)?.new_rating ?? null
  }))

  return { data: withRatings, request_id: crypto.randomUUID() }
})
