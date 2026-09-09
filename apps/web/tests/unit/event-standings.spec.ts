import { describe, it, expect } from 'vitest'
import {
  buildStandings,
  compareStandings,
  type StandingsMatch
} from '../../server/domains/event/services/event-standings'

/**
 * One match: team 1 is [a...], team 2 is [b...], and `won` says which side took
 * it. Scores are the shortest thing that produces that winner, because nothing
 * here depends on the points themselves.
 */
function match(team1: string[], team2: string[], won: 1 | 2): StandingsMatch {
  return {
    match_scores: [
      won === 1
        ? { set_number: 1, team1_score: 11, team2_score: 5 }
        : { set_number: 1, team1_score: 5, team2_score: 11 }
    ],
    match_participants: [
      ...team1.map((id) => ({
        player_id: id,
        team_number: 1 as const,
        player_profiles: { id, display_name: id }
      })),
      ...team2.map((id) => ({
        player_id: id,
        team_number: 2 as const,
        player_profiles: { id, display_name: id }
      }))
    ]
  }
}

describe('event standings', () => {
  it('ranks on wins before anything else', () => {
    const standings = buildStandings([
      match(['ana'], ['ben'], 1),
      match(['ana'], ['cal'], 1),
      match(['ben'], ['cal'], 1)
    ])

    expect(standings.map((r) => r.player_id)).toEqual(['ana', 'ben', 'cal'])
    expect(standings[0]).toMatchObject({ rank: 1, wins: 2, losses: 0 })
  })

  /**
   * The defect this was written for. The tie-break used to be matches played,
   * descending, so turning up more often outranked a better record.
   */
  it('breaks a tie on fewer losses, not on more games played', () => {
    const matches: StandingsMatch[] = [
      // ana: 2 wins, 0 losses, from 2 matches.
      match(['ana'], ['zoe'], 1),
      match(['ana'], ['zoe'], 1),
      // ben: 2 wins, 3 losses, from 5 matches — more games, worse record.
      match(['ben'], ['zoe'], 1),
      match(['ben'], ['zoe'], 1),
      match(['ben'], ['zoe'], 2),
      match(['ben'], ['zoe'], 2),
      match(['ben'], ['zoe'], 2)
    ]

    const standings = buildStandings(matches)
    const ana = standings.find((r) => r.player_id === 'ana')!
    const ben = standings.find((r) => r.player_id === 'ben')!

    expect(ana.wins).toBe(ben.wins)
    expect(ben.matches_played).toBeGreaterThan(ana.matches_played)
    // Equal wins, so the one who lost less is above.
    expect(ana.rank).toBeLessThan(ben.rank)
  })

  it('orders an identical record by name, so the table is stable', () => {
    const a = { player_id: 'p1', display_name: 'Zoe', matches_played: 3, wins: 2, losses: 1 }
    const b = { player_id: 'p2', display_name: 'Ana', matches_played: 3, wins: 2, losses: 1 }

    expect(compareStandings(a, b)).toBeGreaterThan(0)
    expect(compareStandings(b, a)).toBeLessThan(0)
  })

  it('counts every player of a doubles pair', () => {
    const standings = buildStandings([match(['ana', 'ben'], ['cal', 'dee'], 1)])

    expect(
      standings
        .filter((r) => r.wins === 1)
        .map((r) => r.player_id)
        .sort()
    ).toEqual(['ana', 'ben'])
    expect(
      standings
        .filter((r) => r.losses === 1)
        .map((r) => r.player_id)
        .sort()
    ).toEqual(['cal', 'dee'])
  })

  it('ignores a match nobody won rather than awarding it', () => {
    const drawn: StandingsMatch = {
      match_scores: [
        { set_number: 1, team1_score: 11, team2_score: 5 },
        { set_number: 2, team1_score: 5, team2_score: 11 }
      ],
      match_participants: [
        { player_id: 'ana', team_number: 1, player_profiles: { id: 'ana', display_name: 'ana' } },
        { player_id: 'ben', team_number: 2, player_profiles: { id: 'ben', display_name: 'ben' } }
      ]
    }

    expect(buildStandings([drawn])).toEqual([])
  })

  it('ignores a match with no score recorded', () => {
    expect(
      buildStandings([
        {
          match_scores: [],
          match_participants: [
            {
              player_id: 'ana',
              team_number: 1,
              player_profiles: { id: 'ana', display_name: 'ana' }
            }
          ]
        }
      ])
    ).toEqual([])
  })

  it('numbers ranks from one, in order', () => {
    const standings = buildStandings([
      match(['ana'], ['ben'], 1),
      match(['ana'], ['cal'], 1),
      match(['ben'], ['cal'], 1)
    ])

    expect(standings.map((r) => r.rank)).toEqual([1, 2, 3])
  })
})
