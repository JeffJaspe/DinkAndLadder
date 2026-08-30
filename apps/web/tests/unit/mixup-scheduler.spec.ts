import { describe, expect, it } from 'vitest'
import {
  generateMixupSchedule,
  type MixupPlayer,
  type MixupSchedule
} from '../../server/domains/event/services/mixup-scheduler'

function makePlayers(count: number): MixupPlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    queue_id: `q${i + 1}`,
    player_id: `p${i + 1}`
  }))
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** How many times each partnership occurs across the whole schedule. */
function partnerTally(schedule: MixupSchedule): Map<string, number> {
  const tally = new Map<string, number>()
  for (const round of schedule.rounds) {
    for (const match of round.matches) {
      for (const team of [match.team1, match.team2]) {
        for (let i = 0; i < team.players.length; i++) {
          for (let j = i + 1; j < team.players.length; j++) {
            const key = pairKey(team.players[i].player_id, team.players[j].player_id)
            tally.set(key, (tally.get(key) ?? 0) + 1)
          }
        }
      }
    }
  }
  return tally
}

function allPlayerIdsIn(schedule: MixupSchedule, roundIndex: number): string[] {
  return schedule.rounds[roundIndex].matches.flatMap((m) => [
    ...m.team1.players.map((p) => p.player_id),
    ...m.team2.players.map((p) => p.player_id)
  ])
}

describe('shape', () => {
  it('fills every court when there are enough players', () => {
    const schedule = generateMixupSchedule({
      players: makePlayers(8),
      courts: 2,
      rounds: 3,
      format: 'doubles'
    })

    expect(schedule.rounds).toHaveLength(3)
    for (const round of schedule.rounds) {
      expect(round.matches).toHaveLength(2)
      expect(round.sitting_out).toHaveLength(0)
    }
  })

  it('puts two players a side for doubles and one for singles', () => {
    const doubles = generateMixupSchedule({
      players: makePlayers(8),
      courts: 2,
      rounds: 1,
      format: 'doubles'
    })
    expect(doubles.rounds[0].matches[0].team1.players).toHaveLength(2)

    const singles = generateMixupSchedule({
      players: makePlayers(8),
      courts: 2,
      rounds: 1,
      format: 'singles'
    })
    expect(singles.rounds[0].matches[0].team1.players).toHaveLength(1)
  })

  it('never schedules the same player twice in one round', () => {
    const schedule = generateMixupSchedule({
      players: makePlayers(16),
      courts: 4,
      rounds: 5,
      format: 'doubles'
    })

    for (let i = 0; i < schedule.rounds.length; i++) {
      const ids = allPlayerIdsIn(schedule, i)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('limits matches to the number of courts even with players to spare', () => {
    const schedule = generateMixupSchedule({
      players: makePlayers(20),
      courts: 2,
      rounds: 2,
      format: 'doubles'
    })

    for (const round of schedule.rounds) {
      expect(round.matches.length).toBeLessThanOrEqual(2)
    }
  })

  it('numbers courts from 1', () => {
    const schedule = generateMixupSchedule({
      players: makePlayers(12),
      courts: 3,
      rounds: 1,
      format: 'doubles'
    })
    expect(schedule.rounds[0].matches.map((m) => m.court_number)).toEqual([1, 2, 3])
  })
})

describe('rotation — the whole point of the format', () => {
  it('gives eight players seven rounds with no repeated partner', () => {
    // Eight players, two courts: the classic club-night mixer. Every player can
    // partner each of the other seven exactly once.
    const schedule = generateMixupSchedule({
      players: makePlayers(8),
      courts: 2,
      rounds: 7,
      format: 'doubles'
    })

    const tally = partnerTally(schedule)
    for (const [, count] of tally) {
      expect(count).toBe(1)
    }
    // 7 rounds x 2 matches x 2 teams = 28 pairings, and C(8,2) = 28 possible
    // pairs — so every player partners every other player exactly once. This is
    // the perfect rotation the format is named for.
    expect(tally.size).toBe(28)
  })

  it('spreads partners rather than repeating them early', () => {
    const schedule = generateMixupSchedule({
      players: makePlayers(12),
      courts: 3,
      rounds: 4,
      format: 'doubles'
    })

    // With 12 players over 4 rounds there is no need to repeat anyone.
    const tally = partnerTally(schedule)
    const repeats = [...tally.values()].filter((n) => n > 1)
    expect(repeats).toHaveLength(0)
  })

  it('degrades gracefully when repeats become unavoidable', () => {
    // Four players, one court: everyone must partner everyone repeatedly.
    const schedule = generateMixupSchedule({
      players: makePlayers(4),
      courts: 1,
      rounds: 6,
      format: 'doubles'
    })

    expect(schedule.rounds).toHaveLength(6)
    // Still spread: no single pairing should absorb most of the session.
    const tally = partnerTally(schedule)
    expect(Math.max(...tally.values())).toBeLessThanOrEqual(3)
  })
})

describe('sit-outs', () => {
  it('rotates who sits out rather than benching the same people', () => {
    // 10 players, 2 courts: 8 play, 2 sit out each round.
    const schedule = generateMixupSchedule({
      players: makePlayers(10),
      courts: 2,
      rounds: 5,
      format: 'doubles'
    })

    const sitOuts = new Map<string, number>()
    for (const round of schedule.rounds) {
      expect(round.sitting_out).toHaveLength(2)
      for (const p of round.sitting_out) {
        sitOuts.set(p.player_id, (sitOuts.get(p.player_id) ?? 0) + 1)
      }
    }

    // 10 sit-out slots across 10 players: nobody should miss more than one
    // round more than anybody else.
    const counts = makePlayers(10).map((p) => sitOuts.get(p.player_id) ?? 0)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  it('gives everybody a roughly equal number of games', () => {
    const schedule = generateMixupSchedule({
      players: makePlayers(11),
      courts: 2,
      rounds: 8,
      format: 'doubles'
    })

    const counts = Object.values(schedule.gamesPerPlayer)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })
})

describe('edge cases', () => {
  it('returns nothing when there are not enough players for one match', () => {
    const schedule = generateMixupSchedule({
      players: makePlayers(3),
      courts: 1,
      rounds: 4,
      format: 'doubles'
    })
    expect(schedule.rounds).toHaveLength(0)
  })

  it('handles a player count that is not a multiple of four', () => {
    const schedule = generateMixupSchedule({
      players: makePlayers(9),
      courts: 2,
      rounds: 3,
      format: 'doubles'
    })

    for (const round of schedule.rounds) {
      const playing = allPlayerIdsIn(schedule, round.round_number - 1)
      // 9 players, 2 courts -> 8 play, 1 sits. Never a half-filled court.
      expect(playing.length % 4).toBe(0)
      expect(playing.length + round.sitting_out.length).toBe(9)
    }
  })

  it('returns nothing for zero rounds or zero courts', () => {
    expect(
      generateMixupSchedule({ players: makePlayers(8), courts: 0, rounds: 3, format: 'doubles' })
        .rounds
    ).toHaveLength(0)
    expect(
      generateMixupSchedule({ players: makePlayers(8), courts: 2, rounds: 0, format: 'doubles' })
        .rounds
    ).toHaveLength(0)
  })

  it('is deterministic for a given seed — the preview must be what you commit', () => {
    const options = {
      players: makePlayers(12),
      courts: 3,
      rounds: 4,
      format: 'doubles' as const,
      seed: 42
    }
    expect(generateMixupSchedule(options)).toEqual(generateMixupSchedule(options))
  })

  it('produces a different schedule for a different seed', () => {
    const base = { players: makePlayers(12), courts: 3, rounds: 4, format: 'doubles' as const }
    const a = generateMixupSchedule({ ...base, seed: 1 })
    const b = generateMixupSchedule({ ...base, seed: 999 })
    expect(a).not.toEqual(b)
  })
})
