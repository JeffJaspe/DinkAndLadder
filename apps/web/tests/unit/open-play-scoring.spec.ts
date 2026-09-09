import { describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_GAME_RULES,
  isGameComplete,
  rulesForEvent,
  validateGames
} from '../../utils/game-rules'
import { createEventCourtService } from '../../server/domains/event/services/event-court.service'
import type { EventCourtRepository } from '../../server/domains/event/repositories/event-court.repository'
import type { EventQueueRepository } from '../../server/domains/event/repositories/event-queue.repository'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type { EventCourtRecord } from '../../server/domains/event/dto/event.dto'

/**
 * 054-open-play-scoring, and the court label that came with it.
 *
 * Open play had no way to say how long a game is: every court in the product
 * was scored against DEFAULT_GAME_RULES, so a club playing to 15 had a
 * legitimate 15-13 rejected by the score sheet as an unfinished game. And
 * `event_courts.court_name` had been rendered since 017 with nothing able to
 * write it, so a number was the only label a court could ever carry.
 */

describe('rulesForEvent — 054', () => {
  it('reads the three columns off the event', () => {
    expect(rulesForEvent({ target_points: 15, win_by_two: false, games_default: 3 })).toEqual({
      targetPoints: 15,
      winByTwo: false,
      bestOf: 3
    })
  })

  // Every session created before 054 was played to exactly the defaults, so
  // reading a null as anything else would restate a finished session's rules
  // after the fact.
  it('falls back to the defaults for an event that predates the columns', () => {
    expect(rulesForEvent({})).toEqual(DEFAULT_GAME_RULES)
    expect(rulesForEvent({ target_points: null, win_by_two: null, games_default: null })).toEqual(
      DEFAULT_GAME_RULES
    )
  })

  it('falls back to the defaults when there is no event to read', () => {
    expect(rulesForEvent(null)).toEqual(DEFAULT_GAME_RULES)
  })

  it('fills only the columns that are missing', () => {
    expect(rulesForEvent({ target_points: 21 })).toEqual({
      targetPoints: 21,
      winByTwo: true,
      bestOf: 1
    })
  })
})

describe('a session played to something other than 11', () => {
  // The defect this migration exists for: 15-13 is a finished game at a club
  // playing to 15, and the score sheet used to call it unfinished.
  it('accepts 15-13 when the session is played to 15', () => {
    const rules = rulesForEvent({ target_points: 15, win_by_two: true, games_default: 1 })
    const games = [{ team1_score: 15, team2_score: 13 }]

    expect(isGameComplete(games[0], rules)).toBe(true)
    expect(validateGames(games, rules)).toEqual([])
  })

  it('still calls 11-9 unfinished when the session is played to 15', () => {
    const rules = rulesForEvent({ target_points: 15, win_by_two: true, games_default: 1 })
    const problems = validateGames([{ team1_score: 11, team2_score: 9 }], rules)

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('first to 15')
  })

  // Rally-scored 21 without the two-clear-point tail: reaching the number
  // takes it outright, which is the whole reason win_by_two is a column and
  // not an assumption.
  it('ends a game at the target when win by two is off', () => {
    const rules = rulesForEvent({ target_points: 21, win_by_two: false, games_default: 1 })

    expect(isGameComplete({ team1_score: 21, team2_score: 20 }, rules)).toBe(true)
    expect(validateGames([{ team1_score: 21, team2_score: 20 }], rules)).toEqual([])
  })

  it('keeps 21-20 unfinished when win by two is on', () => {
    const rules = rulesForEvent({ target_points: 21, win_by_two: true, games_default: 1 })

    expect(isGameComplete({ team1_score: 21, team2_score: 20 }, rules)).toBe(false)
  })

  it('needs two games of a best of three', () => {
    const rules = rulesForEvent({ target_points: 11, win_by_two: true, games_default: 3 })
    const problems = validateGames(
      [
        { team1_score: 11, team2_score: 5 },
        { team1_score: 4, team2_score: 11 },
        { team1_score: 11, team2_score: 7 }
      ],
      rules
    )

    // All three games could have been played, and all three are finished.
    expect(problems).toEqual([])
  })
})

// ---------------------------------------------------------------------------

function makeCourt(overrides?: Partial<EventCourtRecord>): EventCourtRecord {
  return {
    id: 'court-1',
    event_id: 'event-1',
    court_number: 3,
    court_name: null,
    status: 'available',
    current_match_id: null,
    match_started_at: null,
    live_score: null,
    team1_queue_id: null,
    team2_queue_id: null,
    live_score_updated_at: null,
    round_number: null,
    ...overrides
  }
}

function setup(court: EventCourtRecord | null = makeCourt()) {
  const update = vi.fn(async (_id: string, patch: Partial<EventCourtRecord>) => ({
    ...makeCourt(),
    ...patch
  }))

  const courts = {
    findById: vi.fn().mockResolvedValue(court),
    update,
    listByEvent: vi.fn().mockResolvedValue([]),
    ensureCourts: vi.fn().mockResolvedValue([])
  } as unknown as EventCourtRepository

  return {
    service: createEventCourtService(
      courts,
      {} as unknown as EventQueueRepository,
      {} as unknown as EventRepository
    ),
    update
  }
}

describe('renameCourt', () => {
  it('stores the name a venue actually signposts', async () => {
    const { service, update } = setup()

    const court = await service.renameCourt('court-1', 'Center Court')

    expect(update).toHaveBeenCalledWith('court-1', { court_name: 'Center Court' })
    expect(court.court_name).toBe('Center Court')
  })

  it('trims, so a stray space is not a different name', async () => {
    const { service, update } = setup()

    await service.renameCourt('court-1', '  Court A  ')

    expect(update).toHaveBeenCalledWith('court-1', { court_name: 'Court A' })
  })

  // Clearing is the only way back from a rename somebody regrets — every
  // render site falls back to `Court ${court_number}` on a null.
  it.each<[string | null, string]>([
    ['', 'blank'],
    ['   ', 'whitespace'],
    [null, 'null']
  ])('clears the name back to its number for %s (%s)', async (input) => {
    const { service, update } = setup()

    await service.renameCourt('court-1', input as string | null)

    expect(update).toHaveBeenCalledWith('court-1', { court_name: null })
  })

  it('refuses a name too long to fit on a card', async () => {
    const { service, update } = setup()

    await expect(service.renameCourt('court-1', 'x'.repeat(41))).rejects.toMatchObject({
      status: 400
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('accepts a name at exactly the limit', async () => {
    const { service } = setup()

    await expect(service.renameCourt('court-1', 'x'.repeat(40))).resolves.toBeDefined()
  })

  it('404s for a court that is not there', async () => {
    const { service } = setup(null)

    await expect(service.renameCourt('missing', 'Center')).rejects.toMatchObject({ status: 404 })
  })
})
