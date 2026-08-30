import type { EventCourtRepository } from '../repositories/event-court.repository'
import type { EventQueueRepository } from '../repositories/event-queue.repository'
import type { EventRepository } from '../repositories/event.repository'
import type { EventCourtRecord, EventQueueRecord, LiveGameScore } from '../dto/event.dto'

export class EventCourtServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface StartCourtInput {
  team1_queue_id: string
  team2_queue_id: string
}

export interface EventCourtService {
  /** Creates the court rows for a running event from its `queue_courts` count. */
  openCourts(eventId: string): Promise<EventCourtRecord[]>
  listCourts(eventId: string): Promise<EventCourtRecord[]>
  startCourt(courtId: string, input: StartCourtInput): Promise<EventCourtRecord>
  updateLiveScore(courtId: string, scores: LiveGameScore[]): Promise<EventCourtRecord>
  /**
   * Ends the game on a court and frees it.
   *
   * Returns the queue entries that were playing, so the caller can create the
   * real match through MatchService - this service deliberately does not reach
   * into the match domain itself.
   */
  finishCourt(courtId: string): Promise<{
    court: EventCourtRecord
    team1: EventQueueRecord | null
    team2: EventQueueRecord | null
    finalScore: LiveGameScore[]
  }>
}

/** A game is not a result until somebody has actually won one. */
function isPlayableScore(scores: LiveGameScore[]): boolean {
  return scores.length > 0 && scores.some((g) => g.team1_score > 0 || g.team2_score > 0)
}

export function createEventCourtService(
  courts: EventCourtRepository,
  queue: EventQueueRepository,
  events: EventRepository
): EventCourtService {
  return {
    async openCourts(eventId) {
      const event = await events.findById(eventId)
      if (!event) {
        throw new EventCourtServiceError(404, 'NOT_FOUND', 'Event not found.')
      }

      // queue_courts is the number the organiser set when creating the event.
      // One court is the floor: an event with courts disabled still needs
      // somewhere to record a game.
      const count = Math.max(1, event.queue_courts ?? 1)
      return courts.ensureCourts(eventId, count)
    },

    async listCourts(eventId) {
      return courts.listByEvent(eventId)
    },

    async startCourt(courtId, input) {
      const court = await courts.findById(courtId)
      if (!court) {
        throw new EventCourtServiceError(404, 'NOT_FOUND', 'Court not found.')
      }
      if (court.status === 'playing') {
        throw new EventCourtServiceError(
          409,
          'COURT_BUSY',
          'That court already has a game on it. Submit the score first.'
        )
      }

      if (input.team1_queue_id === input.team2_queue_id) {
        throw new EventCourtServiceError(
          400,
          'VALIDATION_ERROR',
          'A side cannot play against itself.'
        )
      }

      const [team1, team2] = await Promise.all([
        queue.findById(input.team1_queue_id),
        queue.findById(input.team2_queue_id)
      ])

      if (!team1 || !team2) {
        throw new EventCourtServiceError(404, 'NOT_FOUND', 'One of those queue entries is gone.')
      }
      if (team1.event_id !== court.event_id || team2.event_id !== court.event_id) {
        throw new EventCourtServiceError(
          400,
          'VALIDATION_ERROR',
          'Those players are not in this event.'
        )
      }
      // 'matched' is allowed as well as 'waiting': the queue may have paired
      // them already, and re-confirming on court should not be an error.
      for (const entry of [team1, team2]) {
        if (entry.status !== 'waiting' && entry.status !== 'matched') {
          throw new EventCourtServiceError(
            409,
            'ALREADY_PLAYING',
            'One of those players is already on a court.'
          )
        }
      }

      const started = await courts.update(courtId, {
        status: 'playing',
        team1_queue_id: team1.id,
        team2_queue_id: team2.id,
        match_started_at: new Date().toISOString(),
        // A fresh game starts at 0-0 rather than null, so the live view has
        // something to render the moment the court goes live.
        live_score: [{ game_number: 1, team1_score: 0, team2_score: 0 }],
        live_score_updated_at: new Date().toISOString(),
        current_match_id: null
      })

      await Promise.all([
        queue.setMatched(team1.id, court.court_number, team2.id),
        queue.setMatched(team2.id, court.court_number, team1.id)
      ])

      return started
    },

    async updateLiveScore(courtId, scores) {
      const court = await courts.findById(courtId)
      if (!court) {
        throw new EventCourtServiceError(404, 'NOT_FOUND', 'Court not found.')
      }
      if (court.status !== 'playing') {
        throw new EventCourtServiceError(
          409,
          'COURT_NOT_PLAYING',
          'That court has no game running.'
        )
      }

      for (const game of scores) {
        if (
          !Number.isInteger(game.team1_score) ||
          !Number.isInteger(game.team2_score) ||
          game.team1_score < 0 ||
          game.team2_score < 0
        ) {
          throw new EventCourtServiceError(400, 'VALIDATION_ERROR', 'Scores must be whole numbers.')
        }
      }

      // No winning-score rule here on purpose. A live score is a running tally,
      // not a result: 11-9 is as valid mid-game as 3-2, and the format (to 11,
      // to 15, win by two) is a match-submission concern. The final score is
      // validated when the match is actually created.
      return courts.update(courtId, {
        live_score: scores,
        live_score_updated_at: new Date().toISOString()
      })
    },

    async finishCourt(courtId) {
      const court = await courts.findById(courtId)
      if (!court) {
        throw new EventCourtServiceError(404, 'NOT_FOUND', 'Court not found.')
      }
      if (court.status !== 'playing') {
        throw new EventCourtServiceError(
          409,
          'COURT_NOT_PLAYING',
          'That court has no game running.'
        )
      }

      const finalScore = court.live_score ?? []
      if (!isPlayableScore(finalScore)) {
        throw new EventCourtServiceError(
          400,
          'NO_SCORE',
          'Enter a score before submitting the game.'
        )
      }

      const [team1, team2] = await Promise.all([
        court.team1_queue_id ? queue.findById(court.team1_queue_id) : Promise.resolve(null),
        court.team2_queue_id ? queue.findById(court.team2_queue_id) : Promise.resolve(null)
      ])

      // Free the court first: the caller then creates the match, and if that
      // fails the organiser is left with an empty court and a lost score rather
      // than a court permanently stuck on a game nobody can end.
      const freed = await courts.update(courtId, {
        status: 'available',
        team1_queue_id: null,
        team2_queue_id: null,
        current_match_id: null,
        match_started_at: null,
        live_score: null,
        live_score_updated_at: null
      })

      await Promise.all(
        [team1, team2]
          .filter((entry): entry is EventQueueRecord => entry !== null)
          .map((entry) => queue.updateStatus(entry.id, 'completed'))
      )

      return { court: freed, team1, team2, finalScore }
    }
  }
}
