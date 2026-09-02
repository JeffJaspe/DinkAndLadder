import { describe, expect, it, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useGameConfirm, type LiveGame } from '../../composables/useGameConfirm'
import { DEFAULT_GAME_RULES, type GameRules } from '../../utils/game-rules'

/**
 * The scoreboard a scorer taps, and the two things that made it unusable.
 *
 * It rendered a point only after the write AND a full re-read had both come
 * back — two serial round trips before the number moved, which at a venue is
 * seconds per tap. And it closed a game the instant the score qualified, so a
 * mis-tap ended a game and opened the next one before the scorer looked up.
 *
 * Both are behaviour, not styling, so both are pinned here.
 */

const GAME = (team1: number, team2: number, n = 1): LiveGame => ({
  game_number: n,
  team1_score: team1,
  team2_score: team2
})

function setup(rules: Partial<GameRules> = {}, server: LiveGame[] = []) {
  const commit = vi.fn()
  const rulesRef = ref<GameRules>({ ...DEFAULT_GAME_RULES, ...rules })
  const serverGames = ref<LiveGame[]>(server)
  return { ...useGameConfirm(rulesRef, serverGames, commit), commit, serverGames }
}

describe('useGameConfirm — showing the tap immediately', () => {
  it('shows the new score before the server has answered', () => {
    const { addPoint, displayGames, commit } = setup({}, [GAME(3, 2)])

    addPoint(1, 1)

    // The point is on screen and the write has gone out. Nothing waits on a
    // response — that wait is what made each tap cost seconds.
    expect(displayGames.value).toEqual([GAME(4, 2)])
    expect(commit).toHaveBeenCalledWith([GAME(4, 2)])
  })

  it('lets a second tap build on the first without waiting', () => {
    const { addPoint, displayGames, commit } = setup({}, [GAME(3, 2)])

    addPoint(1, 1)
    addPoint(1, 1)

    // Reading the server's array for the second tap would have lost the first.
    expect(displayGames.value).toEqual([GAME(5, 2)])
    expect(commit).toHaveBeenLastCalledWith([GAME(5, 2)])
  })

  it('hands authority back to the server when a fresh board arrives', async () => {
    const { addPoint, displayGames, serverGames } = setup({}, [GAME(3, 2)])

    addPoint(1, 1)
    expect(displayGames.value).toEqual([GAME(4, 2)])

    // Whatever the server says now wins — which is also how a rejected write
    // reverts, without an undo path that could itself fail.
    serverGames.value = [GAME(3, 2)]
    await nextTick()

    expect(displayGames.value).toEqual([GAME(3, 2)])
  })
})

describe('useGameConfirm — confirming the closing game', () => {
  it('holds the point that finishes a game and asks instead', () => {
    const { addPoint, commit, pending, pendingIndex } = setup({}, [GAME(10, 5)])

    addPoint(1, 1)

    // Nothing posted: the question is open and the scorer has not answered.
    expect(commit).not.toHaveBeenCalled()
    expect(pending.value).toEqual([GAME(11, 5)])
    expect(pendingIndex.value).toBe(0)
  })

  it('shows the score it is asking about', () => {
    const { addPoint, displayGames } = setup({}, [GAME(10, 5)])

    addPoint(1, 1)

    expect(displayGames.value).toEqual([GAME(11, 5)])
  })

  it('records the game and opens the next one on confirm', () => {
    const { addPoint, confirm, commit } = setup({ bestOf: 3 }, [GAME(10, 5)])

    addPoint(1, 1)
    confirm()

    expect(commit).toHaveBeenCalledWith([GAME(11, 5), GAME(0, 0, 2)])
  })

  it('does not open a game the match no longer needs', () => {
    // Second game of a best-of-three, one side taking both: the match is over,
    // so a third game could not be played (SC-4).
    const { addPoint, confirm, commit } = setup({ bestOf: 3 }, [GAME(11, 4), GAME(10, 6, 2)])

    addPoint(1, 1)
    confirm()

    expect(commit).toHaveBeenCalledWith([GAME(11, 4), GAME(11, 6, 2)])
  })

  it('leaves nothing behind when the scorer goes back', () => {
    const { addPoint, cancel, commit, pending, displayGames } = setup({}, [GAME(10, 5)])

    addPoint(1, 1)
    cancel()

    // Reverting costs nothing because nothing was posted — which is what makes
    // a mis-tap cost one tap rather than a game.
    expect(pending.value).toBeNull()
    expect(commit).not.toHaveBeenCalled()
    expect(displayGames.value).toEqual([GAME(10, 5)])
  })

  it('never asks when a point is taken away', () => {
    // 12-10 is a finished game, but removing a point is the correction itself;
    // stopping to confirm it would be asking about the mistake.
    const { addPoint, commit, pending } = setup({}, [GAME(12, 11)])

    addPoint(2, -1)

    expect(pending.value).toBeNull()
    expect(commit).toHaveBeenCalledWith([GAME(12, 10)])
  })

  it('respects the margin rule before asking anything', () => {
    // 11-10 is not a finished game with win-by-two on, so it goes straight
    // through as an ordinary point.
    const { addPoint, commit, pending } = setup({}, [GAME(10, 10)])

    addPoint(1, 1)

    expect(pending.value).toBeNull()
    expect(commit).toHaveBeenCalledWith([GAME(11, 10)])
  })

  it('asks at the target when the margin rule is off', () => {
    const { addPoint, commit, pending } = setup({ winByTwo: false }, [GAME(10, 10)])

    addPoint(1, 1)

    expect(commit).not.toHaveBeenCalled()
    expect(pending.value).toEqual([GAME(11, 10)])
  })

  it('never lets a score go below zero', () => {
    const { addPoint, commit } = setup({}, [GAME(0, 3)])

    addPoint(1, -1)

    expect(commit).toHaveBeenCalledWith([GAME(0, 3)])
  })

  it('starts a game from nothing when the board is empty', () => {
    const { addPoint, commit } = setup()

    addPoint(2, 1)

    expect(commit).toHaveBeenCalledWith([GAME(0, 1)])
  })
})
