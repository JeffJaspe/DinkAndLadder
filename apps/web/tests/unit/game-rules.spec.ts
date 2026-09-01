import { describe, it, expect } from 'vitest'
import {
  DEFAULT_GAME_RULES,
  gameWinner,
  gamesNeeded,
  gamesWon,
  isGameComplete,
  isGameLive,
  liveGameIndex,
  resolveResult,
  rulesForRound,
  seriesWinner,
  validateGames,
  type GameRules,
  type GameScore
} from '../../utils/game-rules'

const to11: GameRules = { targetPoints: 11, winByTwo: true, bestOf: 1 }
const bestOf3: GameRules = { ...to11, bestOf: 3 }
const bestOf5: GameRules = { ...to11, bestOf: 5 }
const to21NoMargin: GameRules = { targetPoints: 21, winByTwo: false, bestOf: 1 }

const g = (a: number | null, b: number | null): GameScore => ({ team1_score: a, team2_score: b })

describe('isGameComplete', () => {
  it('needs the target AND the margin', () => {
    expect(isGameComplete(g(11, 9), to11)).toBe(true)
    expect(isGameComplete(g(11, 10), to11)).toBe(false)
  })

  /**
   * The whole reason a margin rule exists: a game runs past the target until
   * someone is two clear, which is what makes 12-10 and 15-13 possible at all.
   */
  it('lets a deuce game run past the target', () => {
    expect(isGameComplete(g(12, 10), to11)).toBe(true)
    expect(isGameComplete(g(13, 12), to11)).toBe(false)
    expect(isGameComplete(g(15, 13), to11)).toBe(true)
  })

  it('takes first to target outright when the margin rule is off', () => {
    expect(isGameComplete(g(21, 20), to21NoMargin)).toBe(true)
  })

  it('is not complete while either side is unentered', () => {
    expect(isGameComplete(g(11, null), to11)).toBe(false)
    expect(isGameComplete(g(null, null), to11)).toBe(false)
  })
})

describe('gameWinner', () => {
  /**
   * This is the bug the shared module exists to prevent. Treating whoever is
   * ahead as the winner made a game look decided at 3-1, which sent the live
   * panel to the next game mid-rally and let an impossible score be stored.
   */
  it('does not name a winner just because one side leads', () => {
    expect(gameWinner(g(3, 1), to11)).toBeNull()
    expect(gameWinner(g(10, 9), to11)).toBeNull()
  })

  it('names the winner once the game is actually won', () => {
    expect(gameWinner(g(11, 9), to11)).toBe(1)
    expect(gameWinner(g(7, 11), to11)).toBe(2)
  })
})

describe('seriesWinner and gamesNeeded', () => {
  it('needs a majority of the games', () => {
    expect(gamesNeeded(to11)).toBe(1)
    expect(gamesNeeded(bestOf3)).toBe(2)
    expect(gamesNeeded(bestOf5)).toBe(3)
  })

  it('decides a best of three at two games', () => {
    expect(seriesWinner([g(11, 5), g(11, 7)], bestOf3)).toBe(1)
    expect(seriesWinner([g(11, 5), g(7, 11)], bestOf3)).toBeNull()
    expect(seriesWinner([g(11, 5), g(7, 11), g(9, 11)], bestOf3)).toBe(2)
  })

  it('ignores unfinished games when counting', () => {
    expect(gamesWon([g(11, 5), g(4, 2)], bestOf3)).toEqual([1, 0])
  })
})

describe('isGameLive — SC-4', () => {
  /**
   * A game played after the match was already won could not have happened, so
   * it must not accept a score. Enforced here rather than only in the UI,
   * because a disabled input is a courtesy and not a guarantee.
   */
  it('closes a game the match already decided', () => {
    const games = [g(11, 5), g(11, 7), g(null, null)]
    expect(isGameLive(games, 0, bestOf3)).toBe(true)
    expect(isGameLive(games, 1, bestOf3)).toBe(true)
    expect(isGameLive(games, 2, bestOf3)).toBe(false)
  })

  it('keeps the decider open when the match is level', () => {
    const games = [g(11, 5), g(7, 11), g(null, null)]
    expect(isGameLive(games, 2, bestOf3)).toBe(true)
  })
})

describe('liveGameIndex', () => {
  it('points at the first unfinished game', () => {
    expect(liveGameIndex([g(11, 5), g(4, 2), g(null, null)], bestOf3)).toBe(1)
  })

  it('is -1 once the match is decided', () => {
    expect(liveGameIndex([g(11, 5), g(11, 7), g(null, null)], bestOf3)).toBe(-1)
  })
})

describe('rulesForRound — SC-1', () => {
  const category = {
    games_default: 3,
    round_game_rules: { '3': 5 },
    target_points: 11,
    win_by_two: true
  }

  it('uses the category default for a round with no override', () => {
    expect(rulesForRound(category, 1).bestOf).toBe(3)
  })

  /** Best of three in the pools, best of five in the final. */
  it('uses the override for a round that has one', () => {
    expect(rulesForRound(category, 3).bestOf).toBe(5)
  })

  it('falls back to the standard rules with no category at all', () => {
    expect(rulesForRound(null, 1)).toEqual(DEFAULT_GAME_RULES)
  })

  it('carries the category target and margin', () => {
    const rules = rulesForRound({ ...category, target_points: 21, win_by_two: false }, 1)
    expect(rules.targetPoints).toBe(21)
    expect(rules.winByTwo).toBe(false)
  })
})

describe('resolveResult — SC-3', () => {
  it('takes the winner from the score for a normal match', () => {
    expect(resolveResult([g(11, 5), g(11, 7)], bestOf3).winner).toBe(1)
  })

  it('will not name a winner for an undecided normal match', () => {
    const result = resolveResult([g(11, 5)], bestOf3)
    expect(result.winner).toBeNull()
    expect(result.problem).toContain('2 games needed')
  })

  /** A DQ names a winner the score cannot — that is the whole point. */
  it('resolves a disqualification from a partial score', () => {
    expect(resolveResult([g(11, 3)], bestOf3, 'dq').winner).toBe(1)
  })

  it('takes an explicit winner when no game was played', () => {
    const result = resolveResult([g(null, null)], bestOf3, 'walkover', 2)
    expect(result.winner).toBe(2)
  })

  it('asks which side advances when nothing can decide it', () => {
    const result = resolveResult([g(null, null)], bestOf3, 'walkover')
    expect(result.winner).toBeNull()
    expect(result.problem).toContain('which side advances')
  })
})

describe('validateGames', () => {
  it('accepts a finished match', () => {
    expect(validateGames([g(11, 5), g(11, 7)], bestOf3)).toEqual([])
  })

  it('rejects a half-entered game', () => {
    expect(validateGames([g(11, null)], to11)[0]).toContain('only one score')
  })

  it('rejects an unfinished game in a normal result', () => {
    expect(validateGames([g(5, 3)], to11)[0]).toContain('not finished')
  })

  /** The same partial game is fine when the match was abandoned. */
  it('allows an unfinished game when the match was retired', () => {
    expect(validateGames([g(5, 3)], to11, 'retired')).toEqual([])
  })

  it('rejects a game that could not have been played', () => {
    const problems = validateGames([g(11, 5), g(11, 7), g(11, 2)], bestOf3)
    expect(problems.some((p) => p.includes('already won'))).toBe(true)
  })

  it('ignores a wholly empty game', () => {
    expect(validateGames([g(11, 5), g(null, null)], to11)).toEqual([])
  })
})
