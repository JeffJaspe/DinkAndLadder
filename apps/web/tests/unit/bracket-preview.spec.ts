import { describe, expect, it } from 'vitest'
import {
  buildPreviewBracket,
  byRegistrationOrder,
  MIN_PREVIEW_DRAW,
  previewDrawSize,
  type PreviewEntrant
} from '~/utils/bracket-preview'
import { GRAND_FINAL_ROUND, isPoolRound, LOSERS_ROUND_OFFSET } from '~/utils/bracket-rounds'

function entrant(n: number, partner: string | null = null): PreviewEntrant {
  return {
    id: `reg-${n}`,
    display_name: `Player ${n}`,
    rating: null,
    partner_display_name: partner
  }
}

const four = [entrant(1), entrant(2), entrant(3), entrant(4)]

function allMatches(bracket: ReturnType<typeof buildPreviewBracket>) {
  return (bracket?.rounds ?? []).flatMap((round) => round.matches)
}

describe('previewDrawSize', () => {
  it('uses the stated capacity, which is the draw the organiser intends', () => {
    expect(previewDrawSize(2, 16)).toBe(16)
  })

  it('rounds a non-power-of-two capacity up', () => {
    expect(previewDrawSize(2, 12)).toBe(16)
  })

  // Two slots is a single match with nothing to connect — showing that as "the
  // picture of the tournament" defeats the point.
  it('never draws smaller than the floor when no capacity is set', () => {
    expect(previewDrawSize(1, null)).toBe(MIN_PREVIEW_DRAW)
    expect(previewDrawSize(2, null)).toBe(MIN_PREVIEW_DRAW)
  })

  it('grows past the floor with the field', () => {
    expect(previewDrawSize(5, null)).toBe(8)
    expect(previewDrawSize(9, null)).toBe(16)
  })
})

describe('byRegistrationOrder', () => {
  it('orders by when they entered, earliest first', () => {
    const rows = [
      { id: 'c', registered_at: '2026-08-25T00:00:00Z' },
      { id: 'a', registered_at: '2026-08-21T00:00:00Z' },
      { id: 'b', registered_at: '2026-08-22T00:00:00Z' }
    ]

    expect(byRegistrationOrder(rows).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  // Two rows written in the same transaction share a timestamp; without the id
  // the order would wander between renders.
  it('settles an identical timestamp on the id', () => {
    const rows = [
      { id: 'b', registered_at: '2026-08-21T00:00:00Z' },
      { id: 'a', registered_at: '2026-08-21T00:00:00Z' }
    ]

    expect(byRegistrationOrder(rows).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('does not mutate its input', () => {
    const rows = [
      { id: 'b', registered_at: '2026-08-25T00:00:00Z' },
      { id: 'a', registered_at: '2026-08-21T00:00:00Z' }
    ]
    byRegistrationOrder(rows)

    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('buildPreviewBracket', () => {
  it('is null when nobody has entered — there is no shape to show', () => {
    expect(buildPreviewBracket('single_elimination', [], null)).toBeNull()
  })

  it('fills the draw to capacity, leaving the empty slots as TBD', () => {
    const bracket = buildPreviewBracket('single_elimination', [entrant(1), entrant(2)], 8)
    const firstRound = bracket!.rounds[0].matches

    expect(firstRound).toHaveLength(4)
    // Both entrants land in slot 1, and every other slot is empty — which
    // BracketMatchCard already renders as TBD.
    expect(firstRound[0].participant1?.display_name).toBe('Player 1')
    expect(firstRound[0].participant2?.display_name).toBe('Player 2')
    expect(firstRound[1].participant1).toBeNull()
    expect(firstRound[1].participant2).toBeNull()
  })

  it('places entrants in the order given', () => {
    const bracket = buildPreviewBracket('single_elimination', four, 4)
    const names = bracket!.rounds[0].matches.map((m) => [
      m.participant1?.display_name,
      m.participant2?.display_name
    ])

    expect(names).toEqual([
      ['Player 1', 'Player 2'],
      ['Player 3', 'Player 4']
    ])
  })

  it('carries a doubles partner through', () => {
    const bracket = buildPreviewBracket('single_elimination', [entrant(1, 'Partner A')], 4)

    expect(bracket!.rounds[0].matches[0].participant1?.partner_display_name).toBe('Partner A')
  })

  /**
   * Nothing in a placeholder can be played. A slot that read 'ready' would send
   * an organiser looking for a Record Result button that is not there, and one
   * that read 'completed' would be a fabricated result.
   */
  it('leaves every slot pending, with no winner and no score', () => {
    const bracket = buildPreviewBracket('round_robin_double_elimination', four, 8)

    for (const match of allMatches(bracket)) {
      expect(match.status).toBe('pending')
      expect(match.winner_registration_id).toBeNull()
      expect(match.scores).toEqual([])
    }
  })

  it('gives every slot a distinct key so the list renders', () => {
    const ids = allMatches(buildPreviewBracket('double_elimination', four, 8)).map((m) => m.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('draws the full round chain of a knockout', () => {
    const bracket = buildPreviewBracket('single_elimination', [entrant(1)], 8)

    // 8 slots -> 4 + 2 + 1
    expect(bracket!.rounds.map((r) => r.matches.length)).toEqual([4, 2, 1])
  })

  it('adds a losers side and a grand final for double elimination', () => {
    const bracket = buildPreviewBracket('double_elimination', four, 4)
    const rounds = bracket!.rounds.map((r) => r.round)

    expect(rounds.some((r) => r >= LOSERS_ROUND_OFFSET && r < GRAND_FINAL_ROUND)).toBe(true)
    expect(rounds).toContain(GRAND_FINAL_ROUND)
  })

  it('draws pools then an empty playoff for a staged format', () => {
    const bracket = buildPreviewBracket('round_robin_single_elimination', four, 4)
    const pools = bracket!.rounds.filter((r) => isPoolRound(r.round))
    const playoffs = bracket!.rounds.filter((r) => r.round >= 50 && r.round < 100)

    expect(pools.length).toBe(2)
    expect(playoffs.length).toBeGreaterThan(0)
    // Who qualifies is decided by results that do not exist yet.
    expect(
      playoffs.every((r) =>
        r.matches.every((m) => m.participant1 === null && m.participant2 === null)
      )
    ).toBe(true)
  })

  it('deals pools round-robin style, so a pool is not one solid block', () => {
    const bracket = buildPreviewBracket('round_robin_single_elimination', four, 4)
    const poolA = bracket!.rounds.find((r) => r.round === 10)!

    // Entrants 1 and 3 go to pool A, 2 and 4 to pool B.
    const inPoolA = new Set(
      poolA.matches.flatMap((m) => [m.participant1?.display_name, m.participant2?.display_name])
    )
    expect(inPoolA).toContain('Player 1')
    expect(inPoolA).toContain('Player 3')
    expect(inPoolA).not.toContain('Player 2')
  })

  it('lists every pairing for a round robin', () => {
    const bracket = buildPreviewBracket('round_robin', four, 4)

    // 4 entrants -> 6 fixtures.
    expect(allMatches(bracket)).toHaveLength(6)
  })
})
