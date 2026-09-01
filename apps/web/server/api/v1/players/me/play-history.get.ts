import { serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

interface PlayHistoryEntry {
  player_id: string
  display_name: string
  match_count: number
  last_played: string
}

interface OpponentEntry extends PlayHistoryEntry {
  wins: number
  losses: number
}

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view play history.')
  }

  const client = serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(claims.sub)

  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const query = getQuery(event)
  const dateFrom = query.date_from ? String(query.date_from) : undefined
  const dateTo = query.date_to ? String(query.date_to) : undefined

  // Find all matches this player participated in
  const { data: myParticipations, error: partError } = await client
    .from('match_participants')
    .select(
      `
      match_id,
      team_number,
      matches!inner(id, played_at, status)
    `
    )
    .eq('player_id', profile.id)
    .eq('matches.status', 'verified')

  if (partError) throw partError

  if (!myParticipations || myParticipations.length === 0) {
    return { data: { partners: [], opponents: [] } }
  }

  interface MyParticipationRow {
    match_id: string
    team_number: number
    matches?: { id: string; played_at: string; status: string } | null
  }
  interface OtherParticipantRow {
    match_id: string
    player_id: string
    team_number: number
    player_profiles?: { display_name?: string | null } | null
  }
  interface MatchScoreRow {
    match_id: string
    team1_score: number
    team2_score: number
  }

  const myParts = myParticipations as unknown as MyParticipationRow[]
  const matchIds = myParts.map((p) => p.match_id)

  // Get all participants in these matches
  const { data: allParticipants, error: allError } = await client
    .from('match_participants')
    .select(
      `
      match_id,
      player_id,
      team_number,
      player_profiles!inner(id, display_name)
    `
    )
    .in('match_id', matchIds)
    .neq('player_id', profile.id)

  if (allError) throw allError

  // Build participation map
  const myTeamByMatch = new Map<string, number>()
  for (const p of myParticipations) {
    myTeamByMatch.set(p.match_id, p.team_number)
  }

  /**
   * When each match was played, by match id.
   *
   * Everything downstream used `myParts.find(...)` to answer this — inside the
   * per-participant loop and again per partner and per opponent — so a player
   * with a few hundred matches paid a linear scan thousands of times over. Same
   * data, one pass.
   */
  const playedAtByMatch = new Map<string, string>()
  for (const p of myParts) {
    if (p.matches?.played_at) playedAtByMatch.set(p.match_id, p.matches.played_at)
  }

  // Get match results
  const { data: scores } = await client
    .from('match_scores')
    .select('match_id, set_number, team1_score, team2_score')
    .in('match_id', matchIds)

  // Sets won per side, accumulated in one pass over the scores rather than by
  // re-filtering the whole score list once per match.
  const setsByMatch = new Map<string, { team1: number; team2: number }>()
  for (const s of (scores ?? []) as unknown as MatchScoreRow[]) {
    const tally = setsByMatch.get(s.match_id) ?? { team1: 0, team2: 0 }
    if (s.team1_score > s.team2_score) tally.team1++
    else if (s.team2_score > s.team1_score) tally.team2++
    setsByMatch.set(s.match_id, tally)
  }

  const matchResults = new Map<string, { winnedTeam: number | null }>()
  for (const matchId of matchIds) {
    const tally = setsByMatch.get(matchId) ?? { team1: 0, team2: 0 }
    const winnedTeam = tally.team1 > tally.team2 ? 1 : tally.team2 > tally.team1 ? 2 : null
    matchResults.set(matchId, { winnedTeam })
  }

  /**
   * Group by player and relationship type.
   *
   * `lastPlayed` is accumulated as a running maximum. It used to be read back
   * afterwards as "the first of my matches that this player also appears in",
   * which is whatever order the participants query happened to return — so
   * "Last played" could name a match from a year ago while the two had played
   * yesterday.
   */
  interface Tally {
    displayName: string
    matchCount: number
    lastPlayed: string
  }
  const partnersMap = new Map<string, Tally>()
  const opponentsMap = new Map<string, Tally & { wins: number; losses: number }>()

  function laterOf(a: string, b: string | undefined): string {
    if (!b) return a
    return !a || new Date(b).getTime() > new Date(a).getTime() ? b : a
  }

  for (const p of (allParticipants ?? []) as unknown as OtherParticipantRow[]) {
    const myTeam = myTeamByMatch.get(p.match_id)
    const displayName = p.player_profiles?.display_name ?? 'Unknown'
    const playedAt = playedAtByMatch.get(p.match_id)

    if (dateFrom && playedAt && new Date(playedAt) < new Date(dateFrom)) continue
    if (dateTo && playedAt && new Date(playedAt) > new Date(dateTo)) continue

    if (p.team_number === myTeam) {
      // Partner (same team)
      const existing = partnersMap.get(p.player_id)
      if (existing) {
        existing.matchCount++
        existing.lastPlayed = laterOf(existing.lastPlayed, playedAt)
      } else {
        partnersMap.set(p.player_id, {
          displayName,
          matchCount: 1,
          lastPlayed: playedAt ?? ''
        })
      }
    } else {
      // Opponent (different team)
      const result = matchResults.get(p.match_id)
      const iWon = result?.winnedTeam === myTeam
      const iLost = result?.winnedTeam !== null && result?.winnedTeam !== myTeam

      const existing = opponentsMap.get(p.player_id)
      if (existing) {
        existing.matchCount++
        existing.lastPlayed = laterOf(existing.lastPlayed, playedAt)
        if (iWon) existing.wins++
        if (iLost) existing.losses++
      } else {
        opponentsMap.set(p.player_id, {
          displayName,
          matchCount: 1,
          lastPlayed: playedAt ?? '',
          wins: iWon ? 1 : 0,
          losses: iLost ? 1 : 0
        })
      }
    }
  }

  // Convert to arrays sorted by match count
  const partners: PlayHistoryEntry[] = Array.from(partnersMap.entries())
    .map(([playerId, data]) => ({
      player_id: playerId,
      display_name: data.displayName,
      match_count: data.matchCount,
      last_played: data.lastPlayed
    }))
    .sort((a, b) => b.match_count - a.match_count)

  const opponents: OpponentEntry[] = Array.from(opponentsMap.entries())
    .map(([playerId, data]) => ({
      player_id: playerId,
      display_name: data.displayName,
      match_count: data.matchCount,
      wins: data.wins,
      losses: data.losses,
      last_played: data.lastPlayed
    }))
    .sort((a, b) => b.match_count - a.match_count)

  return { data: { partners, opponents } }
})
