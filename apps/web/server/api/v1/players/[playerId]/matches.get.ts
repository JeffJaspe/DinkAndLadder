import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import {
  redactParticipants,
  type ParticipantPrivacy,
  type RawParticipant
} from '~/server/domains/match/services/match-history-visibility'
import { apiError } from '~/server/utils/api-error'

/**
 * One player's published match history.
 *
 * The Matches tab used to say "only visible to the player themselves" to every
 * visitor, which on a *public* profile is everyone. 067 made that the player's
 * own decision; this is the endpoint that decision gates.
 *
 * SERVICE ROLE, DELIBERATELY. `matches_select_participant` (008-security, 0016)
 * admits only the people who played, and it is left exactly as it is: a direct
 * PostgREST query still returns nothing for someone else's matches. That is
 * what makes this endpoint the sole path in, and therefore what makes the
 * redaction below real rather than decorative.
 *
 * The gate is three things, all checked here because nothing below can:
 *   1. the profile exists and is public;
 *   2. that player opted in (`show_match_history`);
 *   3. every *other* participant is named only if they opted in too.
 *
 * (3) is the reason this is not an RLS policy — see the 067 changelog header.
 */
export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw apiError(400, 'MISSING_PARAMETER', 'playerId is required.')
  }

  const rawQuery = getQuery(event)
  const limit = Math.min(parseInt(rawQuery.limit as string) || 10, 50)
  const offset = Math.max(parseInt(rawQuery.offset as string) || 0, 0)

  // The subject's own profile is read with the caller's client, so a private
  // profile is refused by the same RLS every other read on this page obeys.
  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findById(playerId)

  if (!profile) {
    throw apiError(404, 'NOT_FOUND', 'Player not found.')
  }
  if (profile.profile_visibility !== 'public') {
    throw apiError(403, 'FORBIDDEN', 'Profile is private.')
  }
  if (!profile.show_match_history) {
    // Distinct from FORBIDDEN: nothing is wrong and nothing will change by
    // retrying. It is a choice, and the profile says so without calling here.
    throw apiError(403, 'MATCH_HISTORY_PRIVATE', 'This player keeps their match history private.')
  }

  const serviceClient = serverSupabaseServiceRole(event)

  const { data: participantRows, error: participantError } = await serviceClient
    .from('match_participants')
    .select('match_id')
    .eq('player_id', playerId)

  if (participantError) {
    console.error('[GET /api/v1/players/:playerId/matches] participants failed:', participantError)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load this player’s matches.')
  }

  const matchIds = [...new Set((participantRows ?? []).map((r) => r.match_id as string))]
  if (matchIds.length === 0) {
    return { data: [], request_id: crypto.randomUUID() }
  }

  const { data: matches, error } = await serviceClient
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
        player_profiles!inner (id, display_name, profile_visibility, show_match_history)
      ),
      match_scores (set_number, team1_score, team2_score)
    `
    )
    .in('id', matchIds)
    .order('played_at', { ascending: false })
    // Same tie-break as /players/me/matches: several matches in one session
    // share a played_at, and an unstable sort lets a page boundary repeat a row.
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[GET /api/v1/players/:playerId/matches] failed:', error)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load this player’s matches.')
  }

  interface JoinedParticipant extends RawParticipant {
    player_profiles?: {
      display_name?: string | null
      profile_visibility?: 'public' | 'private'
      show_match_history?: boolean
    } | null
  }
  interface JoinedMatch {
    id: string
    match_type: string
    status: string
    event_id: string | null
    affects_rating: boolean
    played_at: string
    match_participants?: JoinedParticipant[]
    match_scores?: Array<{ set_number: number; team1_score: number; team2_score: number }>
  }

  const data = ((matches ?? []) as unknown as JoinedMatch[]).map((m) => {
    const raw: RawParticipant[] = (m.match_participants ?? []).map((p) => ({
      player_id: p.player_id,
      team_number: p.team_number,
      result_status: p.result_status ?? null,
      display_name: p.player_profiles?.display_name ?? null
    }))

    const privacyByPlayerId = new Map<string, ParticipantPrivacy>(
      (m.match_participants ?? []).map((p) => [
        p.player_id,
        {
          profile_visibility: p.player_profiles?.profile_visibility ?? 'private',
          show_match_history: p.player_profiles?.show_match_history ?? false
        }
      ])
    )

    return {
      id: m.id,
      match_type: m.match_type,
      status: m.status,
      event_id: m.event_id,
      affects_rating: m.affects_rating,
      played_at: m.played_at,
      participants: redactParticipants(raw, privacyByPlayerId),
      scores: (m.match_scores ?? [])
        .sort((a, b) => a.set_number - b.set_number)
        .map((s) => ({
          set_number: s.set_number,
          team1_score: s.team1_score,
          team2_score: s.team2_score
        }))
    }
  })

  return { data, request_id: crypto.randomUUID() }
})
