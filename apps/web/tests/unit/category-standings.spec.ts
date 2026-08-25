import { describe, expect, it } from 'vitest'
import { computeCategoryStandings, computeStandingsGroups } from '~/utils/category-standings'
import type { BracketDto, BracketMatchDto } from '~/server/domains/event/dto/bracket.dto'

function match(overrides: Partial<BracketMatchDto>): BracketMatchDto {
  return {
    id: 'bm-1',
    tournament_id: 'tournament-1',
    round: 1,
    position: 1,
    match_id: null,
    participant1_registration_id: null,
    participant2_registration_id: null,
    winner_registration_id: null,
    status: 'completed',
    scheduled_at: null,
    category_id: 'cat-1',
    participant1: null,
    participant2: null,
    scores: [],
    ...overrides
  }
}

function bracket(matches: BracketMatchDto[]): BracketDto {
  return {
    tournament_id: 'tournament-1',
    category_id: 'cat-1',
    locked: false,
    rounds: [{ round: 1, matches }]
  }
}

const entrants = [
  { id: 'reg-1', player_id: 'player-1', display_name: 'Ana' },
  { id: 'reg-2', player_id: 'player-2', display_name: 'Ben' },
  { id: 'reg-3', player_id: 'player-3', display_name: 'Cara' }
]

describe('computeCategoryStandings', () => {
  it('counts a decided match as a win for one side and a loss for the other', () => {
    const result = computeCategoryStandings(
      bracket([
        match({
          participant1_registration_id: 'reg-1',
          participant2_registration_id: 'reg-2',
          winner_registration_id: 'reg-1'
        })
      ]),
      entrants
    )

    const ana = result.find((row) => row.registration_id === 'reg-1')!
    const ben = result.find((row) => row.registration_id === 'reg-2')!

    expect(ana).toMatchObject({ wins: 1, losses: 0, matches_played: 1, rank: 1 })
    expect(ben).toMatchObject({ wins: 0, losses: 1, matches_played: 1 })
  })

  // A bye is the absence of an opponent, not a result. Counting it would hand
  // the top seed a free win the field never had a chance to contest.
  it('does not count a bye as a win', () => {
    const result = computeCategoryStandings(
      bracket([
        match({
          id: 'bm-bye',
          status: 'bye',
          participant1_registration_id: 'reg-1',
          winner_registration_id: 'reg-1'
        })
      ]),
      entrants
    )

    expect(result.find((row) => row.registration_id === 'reg-1')).toMatchObject({
      wins: 0,
      losses: 0,
      matches_played: 0
    })
  })

  it('ignores a match with no winner yet', () => {
    const result = computeCategoryStandings(
      bracket([
        match({
          status: 'ready',
          participant1_registration_id: 'reg-1',
          participant2_registration_id: 'reg-2'
        })
      ]),
      entrants
    )

    expect(result.every((row) => row.matches_played === 0)).toBe(true)
  })

  // A slot whose feeder has not finished is not an opponent, so a "win" over it
  // is not a result.
  it('ignores a match with only one filled slot', () => {
    const result = computeCategoryStandings(
      bracket([
        match({
          participant1_registration_id: 'reg-1',
          participant2_registration_id: null,
          winner_registration_id: 'reg-1'
        })
      ]),
      entrants
    )

    expect(result.find((row) => row.registration_id === 'reg-1')?.matches_played).toBe(0)
  })

  it('lists every confirmed entrant, including ones who have not played', () => {
    const result = computeCategoryStandings(bracket([]), entrants)

    expect(result).toHaveLength(3)
    expect(result.map((row) => row.display_name).sort()).toEqual(['Ana', 'Ben', 'Cara'])
  })

  it('ranks by wins, then fewest losses, then name', () => {
    const result = computeCategoryStandings(
      bracket([
        match({
          id: 'm1',
          participant1_registration_id: 'reg-1',
          participant2_registration_id: 'reg-2',
          winner_registration_id: 'reg-1'
        }),
        match({
          id: 'm2',
          position: 2,
          participant1_registration_id: 'reg-1',
          participant2_registration_id: 'reg-3',
          winner_registration_id: 'reg-1'
        }),
        match({
          id: 'm3',
          position: 3,
          participant1_registration_id: 'reg-2',
          participant2_registration_id: 'reg-3',
          winner_registration_id: 'reg-2'
        })
      ]),
      entrants
    )

    expect(result.map((row) => [row.display_name, row.wins, row.losses])).toEqual([
      ['Ana', 2, 0],
      ['Ben', 1, 1],
      ['Cara', 0, 2]
    ])
    expect(result.map((row) => row.rank)).toEqual([1, 2, 3])
  })

  // A withdrawn entrant is no longer in `confirmed`, but their results are still
  // in the bracket. Their row keeps the results rather than vanishing and
  // leaving their opponents' wins unexplained.
  it('keeps a result whose entrant is no longer in the confirmed list', () => {
    const result = computeCategoryStandings(
      bracket([
        match({
          participant1_registration_id: 'reg-1',
          participant2_registration_id: 'reg-gone',
          winner_registration_id: 'reg-1'
        })
      ]),
      entrants
    )

    const ghost = result.find((row) => row.registration_id === 'reg-gone')!
    expect(ghost.display_name).toBe('Unknown player')
    expect(ghost.losses).toBe(1)
  })

  it('returns an empty list when there is no bracket and nobody confirmed', () => {
    expect(computeCategoryStandings(null, [])).toEqual([])
  })
})

describe('computeStandingsGroups', () => {
  const poolEntrants = [
    ...entrants,
    { id: 'reg-4', player_id: 'player-4', display_name: 'Dee' },
    { id: 'reg-5', player_id: 'player-5', display_name: 'Eli' },
    { id: 'reg-6', player_id: 'player-6', display_name: 'Fay' }
  ]

  /** Two pools at the generator's 10 offset: Pool A is round 10, Pool B is 11. */
  const pooled: BracketDto = {
    tournament_id: 'tournament-1',
    category_id: 'cat-1',
    locked: false,
    rounds: [
      {
        round: 10,
        matches: [
          match({
            id: 'a1',
            round: 10,
            participant1_registration_id: 'reg-1',
            participant2_registration_id: 'reg-2',
            winner_registration_id: 'reg-1'
          }),
          match({
            id: 'a2',
            round: 10,
            position: 2,
            participant1_registration_id: 'reg-1',
            participant2_registration_id: 'reg-3',
            winner_registration_id: 'reg-3'
          })
        ]
      },
      {
        round: 11,
        matches: [
          match({
            id: 'b1',
            round: 11,
            participant1_registration_id: 'reg-4',
            participant2_registration_id: 'reg-5',
            winner_registration_id: 'reg-4'
          })
        ]
      }
    ]
  }

  it('returns one table per pool, labelled the way the draw labels it', () => {
    const groups = computeStandingsGroups(pooled, poolEntrants)

    expect(groups.map((g) => g.label)).toEqual(['Pool A', 'Pool B'])
    expect(groups.map((g) => g.round)).toEqual([10, 11])
  })

  // A merged table would rank people who never played each other, and imply a
  // contest between the pools that does not exist until the playoff.
  it('keeps each pool to its own entrants', () => {
    const groups = computeStandingsGroups(pooled, poolEntrants)

    expect(groups[0].entries.map((e) => e.registration_id).sort()).toEqual([
      'reg-1',
      'reg-2',
      'reg-3'
    ])
    expect(groups[1].entries.map((e) => e.registration_id).sort()).toEqual(['reg-4', 'reg-5'])
  })

  it('ranks within the pool, not across the category', () => {
    const groups = computeStandingsGroups(pooled, poolEntrants)

    // Both Ana and Cara are 1–0/1–1 inside Pool A; the pool's own order applies.
    expect(groups[0].entries[0].wins).toBe(1)
    expect(groups[0].entries.every((entry) => entry.rank >= 1)).toBe(true)
    expect(groups[1].entries[0]).toMatchObject({ registration_id: 'reg-4', rank: 1, wins: 1 })
  })

  it('leaves an entrant who is in no pool out of every table', () => {
    const groups = computeStandingsGroups(pooled, poolEntrants)
    const listed = groups.flatMap((g) => g.entries.map((e) => e.registration_id))

    // Fay entered but was not drawn into a pool; she belongs in no group table
    // rather than sitting at 0–0 in all of them.
    expect(listed).not.toContain('reg-6')
  })

  it('collapses to a single table when the format has no pools', () => {
    const groups = computeStandingsGroups(
      bracket([
        match({
          participant1_registration_id: 'reg-1',
          participant2_registration_id: 'reg-2',
          winner_registration_id: 'reg-1'
        })
      ]),
      entrants
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].round).toBeNull()
    expect(groups[0].entries).toHaveLength(3)
  })

  it('returns nothing at all when there is neither a draw nor an entrant', () => {
    expect(computeStandingsGroups(null, [])).toEqual([])
  })
})
