/**
 * Standings for one event, from its verified matches.
 *
 * Pure and separate from the endpoint that serves it. It was inline in
 * `rankings.get.ts`, which made a controller the owner of how a leaderboard is
 * ordered and left the ordering with no test of its own - the thing most worth
 * having one, because "who is top" is the only question this data answers.
 */

export interface StandingsMatch {
  match_scores?: Array<{ set_number: number; team1_score: number; team2_score: number }> | null
  match_participants?: Array<{
    player_id: string
    team_number: 1 | 2
    player_profiles: { id: string; display_name: string } | null
  }> | null
}

export interface StandingsRow {
  player_id: string
  display_name: string
  matches_played: number
  wins: number
  losses: number
}

export interface RankedStandingsRow extends StandingsRow {
  rank: number
}

/**
 * Who won, by games taken. Null when the games are level or nothing was
 * recorded - a match with no winner contributes to nobody's record rather than
 * being awarded to a side by tie-break.
 */
function winningTeam(scores: NonNullable<StandingsMatch['match_scores']>): 1 | 2 | null {
  const team1 = scores.filter((s) => s.team1_score > s.team2_score).length
  const team2 = scores.filter((s) => s.team2_score > s.team1_score).length
  if (team1 > team2) return 1
  if (team2 > team1) return 2
  return null
}

/**
 * The order players are ranked in.
 *
 * Wins first, then FEWER LOSSES - not more matches played, which is what this
 * used to break ties on and had the leaderboard backwards. Two players on five
 * wins were separated by who had played more, so five wins from twelve matches
 * outranked five from six: the player with the worse record was rewarded for
 * having turned up more often. Open play makes that common rather than a corner
 * case, because people arrive late and leave early, so games played varies
 * enormously between two players who had the same evening.
 *
 * Wins stay the primary key rather than win rate, which is the other obvious
 * choice and worse: one win from one match is a perfect record and should not
 * top nine wins from twelve.
 *
 * Name last, so equal records come out in a stable order rather than whatever
 * the map happened to iterate.
 */
export function compareStandings(a: StandingsRow, b: StandingsRow): number {
  return b.wins - a.wins || a.losses - b.losses || a.display_name.localeCompare(b.display_name)
}

export function buildStandings(matches: StandingsMatch[]): RankedStandingsRow[] {
  const byPlayer = new Map<string, StandingsRow>()

  for (const match of matches) {
    const scores = match.match_scores ?? []
    const participants = match.match_participants ?? []
    if (scores.length === 0 || participants.length === 0) continue

    const winner = winningTeam(scores)
    if (winner === null) continue

    for (const p of participants) {
      const row = byPlayer.get(p.player_id) ?? {
        player_id: p.player_id,
        display_name: p.player_profiles?.display_name ?? 'Unknown',
        matches_played: 0,
        wins: 0,
        losses: 0
      }
      row.matches_played += 1
      if (p.team_number === winner) row.wins += 1
      else row.losses += 1
      byPlayer.set(p.player_id, row)
    }
  }

  return [...byPlayer.values()].sort(compareStandings).map((row, i) => ({ rank: i + 1, ...row }))
}
