import { describe, it, expect, vi } from 'vitest'
import { createEventCourtService } from '../../server/domains/event/services/event-court.service'
import type { EventCourtRepository } from '../../server/domains/event/repositories/event-court.repository'
import type { EventQueueRepository } from '../../server/domains/event/repositories/event-queue.repository'
import type { EventRepository } from '../../server/domains/event/repositories/event.repository'
import type {
  EventCourtRecord,
  EventQueueRecord,
  EventRecord
} from '../../server/domains/event/dto/event.dto'

/**
 * The round rule from 052.
 *
 * A round is a wave inferred from what organisers do at the desk, not a
 * schedule handed out in advance, so the whole of its behaviour lives in when
 * `startCourt` decides the session has moved on. That decision is what these
 * cover.
 */

function makeCourt(overrides?: Partial<EventCourtRecord>): EventCourtRecord {
  return {
    id: 'court-1',
    event_id: 'event-1',
    court_number: 1,
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

function makeQueueEntry(overrides?: Partial<EventQueueRecord>): EventQueueRecord {
  return {
    id: 'queue-1',
    event_id: 'event-1',
    player_id: 'player-1',
    match_type: 'doubles',
    partner_id: 'player-2',
    joined_at: '2026-09-01T00:00:00Z',
    status: 'waiting',
    matched_at: null,
    court_number: null,
    match_id: null,
    opponent_queue_id: null,
    ...overrides
  }
}

/**
 * Only the three fields the round rule reads. The court service never touches
 * the rest of an event, and a full record here would just be noise obscuring
 * which value the assertion actually depends on.
 */
function setup(options: { court: EventCourtRecord; currentRound: number }) {
  const updated: Partial<EventCourtRecord>[] = []

  const courts = {
    findById: vi.fn().mockResolvedValue(options.court),
    update: vi.fn(async (_id: string, patch: Partial<EventCourtRecord>) => {
      updated.push(patch)
      return { ...options.court, ...patch }
    }),
    listByEvent: vi.fn().mockResolvedValue([]),
    ensureCourts: vi.fn().mockResolvedValue([])
  } as unknown as EventCourtRepository

  const queue = {
    findById: vi.fn(async (id: string) => makeQueueEntry({ id })),
    setMatched: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined)
  } as unknown as EventQueueRepository

  const setCurrentRound = vi.fn().mockResolvedValue({} as EventRecord)
  const events = {
    findById: vi.fn().mockResolvedValue({ current_round: options.currentRound } as EventRecord),
    setCurrentRound
  } as unknown as EventRepository

  return {
    service: createEventCourtService(courts, queue, events),
    setCurrentRound,
    lastPatch: () => updated[updated.length - 1]
  }
}

const sides = { team1_queue_id: 'queue-a', team2_queue_id: 'queue-b' }

describe('open play rounds', () => {
  it('stamps a court that has never played with the session round', async () => {
    const { service, setCurrentRound, lastPatch } = setup({
      court: makeCourt({ round_number: null }),
      currentRound: 1
    })

    await service.startCourt('court-1', sides)

    expect(lastPatch().round_number).toBe(1)
    // Nothing has finished, so the session has not moved anywhere.
    expect(setCurrentRound).not.toHaveBeenCalled()
  })

  it('keeps a court in the current round when it has not played that round yet', async () => {
    // Court 2 joining a wave court 1 already started.
    const { service, setCurrentRound, lastPatch } = setup({
      court: makeCourt({ round_number: 4 }),
      currentRound: 5
    })

    await service.startCourt('court-1', sides)

    expect(lastPatch().round_number).toBe(5)
    expect(setCurrentRound).not.toHaveBeenCalled()
  })

  it('moves the session on when a court is restarted in the round it just played', async () => {
    const { service, setCurrentRound, lastPatch } = setup({
      court: makeCourt({ round_number: 5 }),
      currentRound: 5
    })

    await service.startCourt('court-1', sides)

    expect(lastPatch().round_number).toBe(6)
    expect(setCurrentRound).toHaveBeenCalledWith('event-1', 6)
  })

  it('treats an event with no round yet as round one', async () => {
    // Every event created before 052 reads back undefined rather than 1.
    const { service, lastPatch } = setup({
      court: makeCourt({ round_number: null }),
      currentRound: undefined as unknown as number
    })

    await service.startCourt('court-1', sides)

    expect(lastPatch().round_number).toBe(1)
  })

  it('hands the round out with the score so the match can record it', async () => {
    const { service } = setup({
      court: makeCourt({
        status: 'playing',
        round_number: 3,
        team1_queue_id: 'queue-a',
        team2_queue_id: 'queue-b',
        live_score: [{ game_number: 1, team1_score: 11, team2_score: 7 }]
      }),
      currentRound: 3
    })

    const finished = await service.finishCourt('court-1')

    expect(finished.round).toBe(3)
  })

  it('leaves round_number on a freed court, so the next start can read it', async () => {
    const { service, lastPatch } = setup({
      court: makeCourt({
        status: 'playing',
        round_number: 3,
        team1_queue_id: 'queue-a',
        team2_queue_id: 'queue-b',
        live_score: [{ game_number: 1, team1_score: 11, team2_score: 7 }]
      }),
      currentRound: 3
    })

    await service.finishCourt('court-1')

    // Clearing it would make the next start look like a court's first game and
    // the session would never advance past its current round.
    expect(lastPatch()).not.toHaveProperty('round_number')
  })
})
