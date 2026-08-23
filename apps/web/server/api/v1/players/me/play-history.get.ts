import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

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
  const claims = await serverSupabaseUser(event)
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

  // Get match results
  const { data: scores } = await client
    .from('match_scores')
    .select('match_id, set_number, team1_score, team2_score')
    .in('match_id', matchIds)

  const matchResults = new Map<string, { winnedTeam: number | null }>()
  for (const matchId of matchIds) {
    const matchScores = ((scores ?? []) as unknown as MatchScoreRow[]).filter(
      (s) => s.match_id === matchId
    )
    let team1Sets = 0
    let team2Sets = 0
    for (const s of matchScores) {
      if (s.team1_score > s.team2_score) team1Sets++
      else if (s.team2_score > s.team1_score) team2Sets++
    }
    const winnedTeam = team1Sets > team2Sets ? 1 : team2Sets > team1Sets ? 2 : null
    matchResults.set(matchId, { winnedTeam })
  }

  // Group by player and relationship type
  const partnersMap = new Map<string, { displayName: string; matches: string[] }>()
  const opponentsMap = new Map<
    string,
    { displayName: string; matches: string[]; wins: number; losses: number }
  >()

  for (const p of (allParticipants ?? []) as unknown as OtherParticipantRow[]) {
    const myTeam = myTeamByMatch.get(p.match_id)
    const displayName = p.player_profiles?.display_name ?? 'Unknown'
    const playedAt = myParts.find((m) => m.match_id === p.match_id)?.matches?.played_at

    if (dateFrom && playedAt && new Date(playedAt) < new Date(dateFrom)) continue
    if (dateTo && playedAt && new Date(playedAt) > new Date(dateTo)) continue

    if (p.team_number === myTeam) {
      // Partner (same team)
      const existing = partnersMap.get(p.player_id)
      if (existing) {
        existing.matches.push(p.match_id)
      } else {
        partnersMap.set(p.player_id, { displayName, matches: [p.match_id] })
      }
    } else {
      // Opponent (different team)
      const result = matchResults.get(p.match_id)
      const iWon = result?.winnedTeam === myTeam
      const iLost = result?.winnedTeam !== null && result?.winnedTeam !== myTeam

      const existing = opponentsMap.get(p.player_id)
      if (existing) {
        existing.matches.push(p.match_id)
        if (iWon) existing.wins++
        if (iLost) existing.losses++
      } else {
        opponentsMap.set(p.player_id, {
          displayName,
          matches: [p.match_id],
          wins: iWon ? 1 : 0,
          losses: iLost ? 1 : 0
        })
      }
    }
  }

  // Convert to arrays sorted by match count
  const partners: PlayHistoryEntry[] = Array.from(partnersMap.entries())
    .map(([playerId, data]) => {
      const lastMatch = myParts.find((m) => data.matches.includes(m.match_id))
      return {
        player_id: playerId,
        display_name: data.displayName,
        match_count: data.matches.length,
        last_played: lastMatch?.matches?.played_at ?? ''
      }
    })
    .sort((a, b) => b.match_count - a.match_count)

  const opponents: OpponentEntry[] = Array.from(opponentsMap.entries())
    .map(([playerId, data]) => {
      const lastMatch = myParts.find((m) => data.matches.includes(m.match_id))
      return {
        player_id: playerId,
        display_name: data.displayName,
        match_count: data.matches.length,
        wins: data.wins,
        losses: data.losses,
        last_played: lastMatch?.matches?.played_at ?? ''
      }
    })
    .sort((a, b) => b.match_count - a.match_count)

  return { data: { partners, opponents } }
})
