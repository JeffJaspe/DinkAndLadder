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
   * The final score when the match was decided, preserved even if the server
   * clears live_score. This prevents the display from resetting to 0-0 after
   * a game-ending point is confirmed.
   */
  const decidedScore = ref<LiveGame[] | null>(null)
  /**
   * Monotonic counter incremented on each write. Poll results are ignored
   * unless they arrive after the latest write completes.
   */
  const writeSeq = ref(0)
  const ackedSeq = ref(0)

  /**
   * A new board from the server ends the optimistic period — but only if the
   * server actually has scores to show AND we don't have a pending write.
   *
   * The race that caused random -1 regressions: user taps +1 → optimistic set
   * → PATCH sent → poll fires before PATCH completes → poll returns stale data
   * → optimistic cleared → display snaps back. Now we ignore poll results while
   * a write is in flight (writeSeq > ackedSeq).
   *
   * Success and failure both land here: the caller re-reads after either, so a
   * write that was rejected reverts on its own rather than needing an undo path
   * that could itself fail.
   *
   * If the server comes back empty/zeroed while we have a meaningful optimistic
   * or decided score, we keep showing ours rather than resetting to blank.
   */
  watch(serverGames, (newGames) => {
    // Ignore stale poll results while a write is in flight
    if (writeSeq.value > ackedSeq.value) return

    const hasServerScore = newGames.length > 0 &&
      (newGames[0].team1_score > 0 || newGames[0].team2_score > 0)

    // Only clear decided score if server has actual scores
    if (hasServerScore) {
      decidedScore.value = null
    }

    // Only clear optimistic if server has actual scores OR we don't have
    // anything meaningful to preserve
    if (hasServerScore || !optimistic.value?.length) {
      optimistic.value = null
    }
  })

  /** What the scoreboard shows: the question, the unconfirmed tap, the decided score, or the server. */
  const displayGames = computed<LiveGame[]>(
    () => pending.value ?? optimistic.value ?? decidedScore.value ?? serverGames.value
  )

  /**
   * Whether adding points should be blocked.
   *
   * Plus is disabled when:
   * - The confirm dialog is open (pending !== null)
   * - The current game is already complete (winning score reached)
   * - The match is already decided
   *
   * The user can only press minus to go back below the winning score,
   * which will cancel the pending state and re-enable plus.
   */
  const plusDisabled = computed(() => {
    if (pending.value !== null) return true

    const games = displayGames.value
    if (!games.length) return false

    // Check if match is already decided
    if (seriesWinner(games.map(toGameScore), rules.value) !== null) return true

    // Check if current game is already complete
    const currentGame = games[games.length - 1]
    if (currentGame && isGameComplete(toGameScore(currentGame), rules.value)) return true

    return false
  })

  function toGameScore(game: LiveGame): GameScore {
    return { team1_score: game.team1_score, team2_score: game.team2_score }
  }

  let ackTimer: ReturnType<typeof setTimeout> | null = null

  function send(games: LiveGame[]) {
    optimistic.value = games
    writeSeq.value++
    commit(games)

    // Auto-ack after 3 seconds. The PATCH typically completes in <2s and the
    // poll interval is 5s, so this window prevents stale poll data from
    // overwriting the optimistic value during the round trip.
    if (ackTimer) clearTimeout(ackTimer)
    ackTimer = setTimeout(() => {
      ackedSeq.value = writeSeq.value
      ackTimer = null
    }, 3000)
  }

  /**
   * Signal that the server has acknowledged the latest write. Called by the
   * scorer after the PATCH completes (success or failure), or auto-fires after
   * 3 seconds. Until this is called, poll results are ignored to prevent stale
   * data from overwriting the optimistic value.
   */
  function ackWrite() {
    if (ackTimer) {
      clearTimeout(ackTimer)
      ackTimer = null
    }
    ackedSeq.value = writeSeq.value
  }

  /** Apply one point to the live game. */
  function addPoint(team: 1 | 2, delta: number) {
    // Block plus when disabled (pending, game complete, or match decided)
    if (delta > 0 && plusDisabled.value) {
      return
    }

    // If minus is pressed while pending, cancel the pending state and
    // apply the minus to restore the score below the winning threshold
    if (delta < 0 && pending.value !== null) {
      const games = [...pending.value]
      const index = Math.max(0, games.length - 1)
      const game = games[index]

      const next: LiveGame = {
        ...game,
        team1_score: team === 1 ? Math.max(0, game.team1_score + delta) : game.team1_score,
        team2_score: team === 2 ? Math.max(0, game.team2_score + delta) : game.team2_score
      }
      games[index] = next

      // Cancel pending and send the reduced score
      pending.value = null
      send(games)
      return
    }

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
    const isMatchDecided = seriesWinner(played, rules.value) !== null

    // If match is decided, preserve this score so it doesn't reset when
    // server clears live_score
    if (isMatchDecided) {
      decidedScore.value = games
    }

    const next = isMatchDecided
      ? games
      : [...games, { game_number: games.length + 1, team1_score: 0, team2_score: 0 }]

    pending.value = null
    send(next)
  }

  /** No: drop the pending point entirely. Nothing was posted, so nothing undoes. */
  function cancel() {
    pending.value = null
  }

  return { displayGames, pending, pendingIndex, decidedScore, plusDisabled, addPoint, confirm, cancel, ackWrite }
}
