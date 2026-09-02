import { isGameComplete, seriesWinner, type GameRules, type GameScore } from '~/utils/game-rules'

/** The live-score row shape both scoring surfaces post. */
export interface LiveGame {
  game_number: number
  team1_score: number
  team2_score: number
}

/**
 * The scoreboard a scorer is actually tapping.
 *
 * Two behaviours live here because they are the same problem seen twice — the
 * gap between a tap and the screen agreeing with it.
 *
 * **The score appears immediately.** A point used to render only after the
 * PATCH *and* a full re-read of the board had both come back: two serial round
 * trips to a database on another continent before the number moved, which is
 * seconds at a court on venue wifi. The tapped score is now shown at once and
 * the request goes out behind it. `serverGames` remains the authority — when a
 * fresh board arrives, whatever it says wins, so a rejected write corrects
 * itself as soon as the caller re-reads.
 *
 * **The point that ends a game stops and asks.** Both surfaces used to close a
 * game the instant the score qualified: the next game opened under the scorer's
 * finger and the closing score was already saved. Fine when the tap was right,
 * unrecoverable when it was not. The mockup answers this with a confirmation on
 * the closing point only, and "No, go back" restores the score to before that
 * tap — so a mis-tap costs one tap rather than a game. Nothing is posted while
 * the question is open, which is what makes going back free: there is no write
 * to compensate for.
 *
 * Taking a point away never asks. That IS the correction.
 */
export function useGameConfirm(
  rules: Ref<GameRules>,
  serverGames: Ref<LiveGame[]>,
  commit: (games: LiveGame[]) => void
) {
  /** Sent and not yet echoed back by the server. */
  const optimistic = ref<LiveGame[] | null>(null)
  /** The would-be games array, held while the scorer is being asked. */
  const pending = ref<LiveGame[] | null>(null)
  /** Index of the game that just closed, for the dialog's "Game N" kicker. */
  const pendingIndex = ref(0)

  /**
   * A new board from the server ends the optimistic period, whatever it says.
   *
   * Success and failure both land here: the caller re-reads after either, so a
   * write that was rejected reverts on its own rather than needing an undo path
   * that could itself fail.
   */
  watch(serverGames, () => {
    optimistic.value = null
  })

  /** What the scoreboard shows: the question, the unconfirmed tap, or the server. */
  const displayGames = computed<LiveGame[]>(
    () => pending.value ?? optimistic.value ?? serverGames.value
  )

  function toGameScore(game: LiveGame): GameScore {
    return { team1_score: game.team1_score, team2_score: game.team2_score }
  }

  function send(games: LiveGame[]) {
    optimistic.value = games
    commit(games)
  }

  /** Apply one point to the live game. */
  function addPoint(team: 1 | 2, delta: number) {
    const games = [...displayGames.value]
    const index = Math.max(0, games.length - 1)
    const game = games[index] ?? { game_number: 1, team1_score: 0, team2_score: 0 }

    const next: LiveGame = {
      ...game,
      team1_score: team === 1 ? Math.max(0, game.team1_score + delta) : game.team1_score,
      team2_score: team === 2 ? Math.max(0, game.team2_score + delta) : game.team2_score
    }
    games[index] = next

    if (delta > 0 && isGameComplete(toGameScore(next), rules.value)) {
      pending.value = games
      pendingIndex.value = index
      return
    }

    send(games)
  }

  /**
   * Yes: record the game, and open the next one unless the match is over.
   *
   * Advancing happens here rather than when the score qualified, so the game
   * that opens is one the scorer has confirmed reaching.
   */
  function confirm() {
    const games = pending.value
    if (!games) return

    const played = games.map(toGameScore)
    const next = seriesWinner(played, rules.value)
      ? games
      : [...games, { game_number: games.length + 1, team1_score: 0, team2_score: 0 }]

    pending.value = null
    send(next)
  }

  /** No: drop the pending point entirely. Nothing was posted, so nothing undoes. */
  function cancel() {
    pending.value = null
  }

  return { displayGames, pending, pendingIndex, addPoint, confirm, cancel }
}
