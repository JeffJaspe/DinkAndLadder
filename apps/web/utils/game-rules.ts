/**
 * The rules that decide when a game is over and who won a match.
 *
 * One module, used by the score sheet, the live input, the bracket and the
 * server-side validation, so all four cannot disagree about whether 11-10 is a
 * finished game. Pure functions with no imports — this is deliberately
 * shareable between `server/` and the pages.
 *
 * Vocabulary: these are GAMES, not sets. The sport, the paper score sheet and
 * `bracket_matches.live_score` all say game; only `match_scores.set_number`
 * says otherwise, and renaming that column is a separate change.
 */

export interface GameRules {
  /** Points that win a game — 11, 15, 21 or whatever the organiser set. */
  targetPoints: number
  /** Whether a game must be won by a clear two, which is what makes 12-10 possible. */
  winByTwo: boolean
  /** Best-of. Always odd, so a series is always decidable. 1 is a single game. */
  bestOf: number
}

export const DEFAULT_GAME_RULES: GameRules = {
  targetPoints: 11,
  winByTwo: true,
  bestOf: 1
}

export interface GameScore {
  team1_score: number | null
  team2_score: number | null
}

/** How a match ended. Anything but `normal` can name a winner without a full score. */
export type MatchResultType = 'normal' | 'retired' | 'dq' | 'walkover'

/** Which of the three parties entered the score. */
export type SubmittedByRole = 'team_1' | 'team_2' | 'organizer'

/**
 * The rules in force for one round.
 *
 * `roundGameRules` holds only the exceptions — `{ "3": 5 }` means round 3 is
 * best of 5 — so an absent round falls back to the category default rather
 * than to a constant hidden somewhere else.
 */
export function rulesForRound(
  category: {
    target_points?: number | null
    win_by_two?: boolean | null
    games_default?: number | null
    round_game_rules?: Record<string, number> | null
  } | null,
  round?: number | null
): GameRules {
  const bestOfDefault = category?.games_default ?? DEFAULT_GAME_RULES.bestOf
  const override =
    round != null && category?.round_game_rules
      ? category.round_game_rules[String(round)]
      : undefined

  return {
    targetPoints: category?.target_points ?? DEFAULT_GAME_RULES.targetPoints,
    winByTwo: category?.win_by_two ?? DEFAULT_GAME_RULES.winByTwo,
    bestOf: override ?? bestOfDefault
  }
}

/** Games one side must take to win the match. */
export function gamesNeeded(rules: GameRules): number {
  return Math.floor(rules.bestOf / 2) + 1
}

/**
 * Is this game finished?
 *
 * Reaching the target is not enough on its own when `winByTwo` is set — that
 * is exactly what lets a game run past it to 13-11. With it off, first to the
 * target takes it outright.
 */
export function isGameComplete(game: GameScore, rules: GameRules): boolean {
  const a = game.team1_score
  const b = game.team2_score
  if (a == null || b == null) return false
  const highest = Math.max(a, b)
  const margin = Math.abs(a - b)
  return highest >= rules.targetPoints && margin >= (rules.winByTwo ? 2 : 1)
}

/**
 * Who won this game, or null while it is unfinished.
 *
 * Deliberately NOT "whoever is ahead": at 3-1 nobody has won anything, and
 * treating a lead as a win makes a live scoreboard skip to the next game
 * mid-rally and makes an impossible score look decided.
 */
export function gameWinner(game: GameScore, rules: GameRules): 1 | 2 | null {
  if (!isGameComplete(game, rules)) return null
  return (game.team1_score as number) > (game.team2_score as number) ? 1 : 2
}

/** Games won by each side, counting only finished games. */
export function gamesWon(games: GameScore[], rules: GameRules): [number, number] {
  let one = 0
  let two = 0
  for (const game of games) {
    const winner = gameWinner(game, rules)
    if (winner === 1) one++
    else if (winner === 2) two++
  }
  return [one, two]
}

/** Who won the match on games alone, or null if it is not decided. */
export function seriesWinner(games: GameScore[], rules: GameRules): 1 | 2 | null {
  const [one, two] = gamesWon(games, rules)
  const needed = gamesNeeded(rules)
  if (one >= needed) return 1
  if (two >= needed) return 2
  return null
}

/**
 * Can this game still affect the outcome?
 *
 * False once an EARLIER game already decided the match — game 3 of a best-of-3
 * that stands at 2-0 never happened, so accepting a score for it stores a
 * result that could not have occurred. Enforced in the service as well as the
 * UI, because a disabled input is a courtesy and not a guarantee.
 */
export function isGameLive(games: GameScore[], index: number, rules: GameRules): boolean {
  const needed = gamesNeeded(rules)
  let one = 0
  let two = 0
  for (let i = 0; i < index; i++) {
    const winner = gameWinner(games[i], rules)
    if (winner === 1) one++
    else if (winner === 2) two++
  }
  return one < needed && two < needed
}

/** Index of the game being played now, or -1 when the match is over. */
export function liveGameIndex(games: GameScore[], rules: GameRules): number {
  for (let i = 0; i < games.length; i++) {
    if (!isGameLive(games, i, rules)) return -1
    if (!isGameComplete(games[i], rules)) return i
  }
  return -1
}

export interface ResolvedResult {
  winner: 1 | 2 | null
  /** Why there is no winner yet, for the UI to show. Null when there is one. */
  problem: string | null
}

/**
 * The winner of a match, from its score and how it ended.
 *
 * For a normal match the score decides it and nothing else is accepted. For a
 * retirement, DQ or walkover the score cannot decide it — that is the whole
 * point — so the games won so far break the tie, and an explicit winner may be
 * supplied for the case where no game was ever finished.
 */
export function resolveResult(
  games: GameScore[],
  rules: GameRules,
  resultType: MatchResultType = 'normal',
  explicitWinner?: 1 | 2 | null
): ResolvedResult {
  if (resultType === 'normal') {
    const winner = seriesWinner(games, rules)
    if (winner) return { winner, problem: null }
    const needed = gamesNeeded(rules)
    return {
      winner: null,
      problem: `Not decided yet — ${needed} ${needed === 1 ? 'game' : 'games'} needed to win.`
    }
  }

  if (explicitWinner) return { winner: explicitWinner, problem: null }

  const [one, two] = gamesWon(games, rules)
  if (one !== two) return { winner: one > two ? 1 : 2, problem: null }

  return {
    winner: null,
    problem: 'Say which side advances — the score does not decide this one.'
  }
}

/**
 * Every reason a set of games is not a valid result, or an empty list.
 *
 * Returned as a list rather than throwing on the first: someone fixing a score
 * sheet should see everything wrong with it at once.
 */
export function validateGames(
  games: GameScore[],
  rules: GameRules,
  resultType: MatchResultType = 'normal'
): string[] {
  const problems: string[] = []

  games.forEach((game, index) => {
    const a = game.team1_score
    const b = game.team2_score
    if (a == null && b == null) return

    if (a == null || b == null) {
      problems.push(`Game ${index + 1} has only one score.`)
      return
    }
    if (a < 0 || b < 0) {
      problems.push(`Game ${index + 1} has a negative score.`)
      return
    }
    if (!isGameLive(games, index, rules)) {
      problems.push(`Game ${index + 1} could not have been played — the match was already won.`)
      return
    }
    // An unfinished game is fine when the match was abandoned; in a normal
    // result it means somebody stopped typing halfway.
    if (resultType === 'normal' && !isGameComplete(game, rules)) {
      problems.push(
        `Game ${index + 1} is not finished — first to ${rules.targetPoints}` +
          (rules.winByTwo ? ', win by 2.' : '.')
      )
    }
  })

  return problems
}
