import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

interface HeadToHeadMatch {
  match_id: string
  match_type: 'singles' | 'doubles'
  played_at: string
  scores: Array<{ set_number: number; team1_score: number; team2_score: number }>
  result: 'win' | 'loss' | 'draw'
  my_team: number
  opponent_team: number
}

interface HeadToHeadStats {
  opponent: {
    id: string
    display_name: string
  }
  total_matches: number
  wins: number
  losses: number
  draws: number
  matches: HeadToHeadMatch[]
}

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view head-to-head stats.')
  }

  const opponentPlayerId = getRouterParam(event, 'playerId')
  if (!opponentPlayerId) {
    throw apiError(400, 'VALIDATION_ERROR', 'playerId is required.')
  }

  const client = serverSupabaseServiceRole(event)
  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(claims.sub)

  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  // Get opponent profile
  const opponentProfile = await playerRepo.findById(opponentPlayerId)
  if (!opponentProfile) {
    throw apiError(404, 'NOT_FOUND', 'Opponent player not found.')
  }

  // Find all verified matches where both players participated
  const { data: myParticipations } = await client
    .from('match_participants')
    .select('match_id, team_number')
    .eq('player_id', profile.id)

  const { data: opponentParticipations } = await client
    .from('match_participants')
    .select('match_id, team_number')
    .eq('player_id', opponentPlayerId)

  if (!myParticipations || !opponentParticipations) {
    return { data: { opponent: { id: opponentPlayerId, display_name: opponentProfile.display_name }, total_matches: 0, wins: 0, losses: 0, draws: 0, matches: [] } }
  }

  // Find common matches
  const myMatchMap = new Map(myParticipations.map(p => [p.match_id, p.team_number]))
  const commonMatchIds: string[] = []
  const opponentTeamByMatch = new Map<string, number>()

  for (const p of opponentParticipations) {
    if (myMatchMap.has(p.match_id)) {
      commonMatchIds.push(p.match_id)
      opponentTeamByMatch.set(p.match_id, p.team_number)
    }
  }

  if (commonMatchIds.length === 0) {
    return { data: { opponent: { id: opponentPlayerId, display_name: opponentProfile.display_name }, total_matches: 0, wins: 0, losses: 0, draws: 0, matches: [] } }
  }

  // Get match details
  const { data: matchDetails } = await client
    .from('matches')
    .select('id, match_type, played_at, status')
    .in('id', commonMatchIds)
    .eq('status', 'verified')
    .order('played_at', { ascending: false })

  if (!matchDetails || matchDetails.length === 0) {
    return { data: { opponent: { id: opponentPlayerId, display_name: opponentProfile.display_name }, total_matches: 0, wins: 0, losses: 0, draws: 0, matches: [] } }
  }

  // Get scores for all matches
  const { data: allScores } = await client
    .from('match_scores')
    .select('match_id, set_number, team1_score, team2_score')
    .in('match_id', matchDetails.map(m => m.id))
    .order('set_number', { ascending: true })

  const scoresByMatch = new Map<string, Array<{ set_number: number; team1_score: number; team2_score: number }>>()
  for (const s of allScores ?? []) {
    if (!scoresByMatch.has(s.match_id)) {
      scoresByMatch.set(s.match_id, [])
    }
    scoresByMatch.get(s.match_id)!.push({ set_number: s.set_number, team1_score: s.team1_score, team2_score: s.team2_score })
  }

  // Calculate results
  let wins = 0
  let losses = 0
  let draws = 0
  const matches: HeadToHeadMatch[] = []

  for (const match of matchDetails) {
    const myTeam = myMatchMap.get(match.id)!
    const oppTeam = opponentTeamByMatch.get(match.id)!
    const scores = scoresByMatch.get(match.id) ?? []

    let mySetWins = 0
    let oppSetWins = 0
    for (const s of scores) {
      const team1Won = s.team1_score > s.team2_score
      if ((myTeam === 1 && team1Won) || (myTeam === 2 && !team1Won)) {
        mySetWins++
      } else if ((oppTeam === 1 && team1Won) || (oppTeam === 2 && !team1Won)) {
        oppSetWins++
      }
    }

    let result: 'win' | 'loss' | 'draw'
    if (mySetWins > oppSetWins) {
      result = 'win'
      wins++
    } else if (oppSetWins > mySetWins) {
      result = 'loss'
      losses++
    } else {
      result = 'draw'
      draws++
    }

    matches.push({
      match_id: match.id,
      match_type: match.match_type,
      played_at: match.played_at,
      scores,
      result,
      my_team: myTeam,
      opponent_team: oppTeam
    })
  }

  const stats: HeadToHeadStats = {
    opponent: {
      id: opponentPlayerId,
      display_name: opponentProfile.display_name
    },
    total_matches: matchDetails.length,
    wins,
    losses,
    draws,
    matches
  }

  return { data: stats }
})
