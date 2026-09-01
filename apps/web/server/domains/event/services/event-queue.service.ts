import type { EventQueueRepository } from '../repositories/event-queue.repository'
import type { EventRegistrationRepository } from '../repositories/event-registration.repository'
import type { EventRepository } from '../repositories/event.repository'
import type { EventQueueRecord } from '../dto/event.dto'

export class EventQueueServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface EventQueueService {
  listQueue(eventId: string): Promise<EventQueueRecord[]>
  joinQueue(
    eventId: string,
    playerId: string,
    matchType: 'singles' | 'doubles',
    partnerId?: string | null
  ): Promise<EventQueueRecord>
  leaveQueue(eventId: string, playerId: string): Promise<void>
  matchEntries(
    actingPlayerId: string,
    eventId: string,
    queueId1: string,
    queueId2: string,
    courtNumber: number
  ): Promise<{ first: EventQueueRecord; second: EventQueueRecord }>
  /**
   * Pairs the two longest-waiting entries of the same match type.
   *
   * The selection happens here rather than in the browser on purpose: two
   * organisers tapping "Match next" at the same moment would otherwise both
   * compute the same head of the queue from their own stale copy and send it as
   * an explicit pair. Reading the queue inside the request narrows that to the
   * ordinary write race, which the 'waiting' status check already loses safely.
   */
  matchNextPair(
    actingPlayerId: string,
    eventId: string,
    courtNumber: number,
    matchType?: 'singles' | 'doubles'
  ): Promise<{ first: EventQueueRecord; second: EventQueueRecord }>
  skipEntry(actingPlayerId: string, eventId: string, queueId: string): Promise<EventQueueRecord>
}

async function assertRegistered(
  registrations: EventRegistrationRepository,
  eventId: string,
  playerId: string
) {
  const registration = await registrations.findByEventAndPlayer(eventId, playerId)
  if (!registration || registration.status === 'withdrawn') {
    throw new EventQueueServiceError(
      403,
      'NOT_REGISTERED',
      'You must be registered to this event to use the queue.'
    )
  }
}

async function assertOrganizer(events: EventRepository, eventId: string, playerId: string) {
  const event = await events.findById(eventId)
  if (!event) {
    throw new EventQueueServiceError(404, 'NOT_FOUND', 'Event not found.')
  }
  if (event.created_by_player_id !== playerId) {
    throw new EventQueueServiceError(
      403,
      'FORBIDDEN',
      'Only the event organizer can manage the queue.'
    )
  }
  return event
}

export function createEventQueueService(
  queue: EventQueueRepository,
  registrations: EventRegistrationRepository,
  events: EventRepository
): EventQueueService {
  // Named rather than returned inline so matchNextPair can delegate to
  // matchEntries without depending on `this`, which a destructured service loses.
  const service: EventQueueService = {
    async listQueue(eventId) {
      return queue.findByEvent(eventId)
    },

    async joinQueue(eventId, playerId, matchType, partnerId) {
      await assertRegistered(registrations, eventId, playerId)

      const existing = await queue.findByEventAndPlayer(eventId, playerId)
      if (existing) {
        throw new EventQueueServiceError(409, 'ALREADY_QUEUED', 'You are already in the queue.')
      }

      /**
       * Mix & Match pairs people itself, so asking for a partner contradicts
       * the mode: the scheduler's whole job there is to rotate partners and
       * opponents so nobody plays with the same person twice. Demanding one up
       * front made a solo drop-in — the normal way somebody joins an open play
       * session — impossible to enter.
       *
       * Every other mode still needs one. A first-come queue entry IS a side of
       * a court, so without a partner there is no side to queue, and inventing
       * one by pairing whoever is next is a scheduling rule nobody has decided.
       */
      const eventRecord = await events.findById(eventId)
      const pairsAutomatically = eventRecord?.queue_mode === 'random'

      if (matchType === 'doubles' && !pairsAutomatically) {
        if (!partnerId) {
          throw new EventQueueServiceError(
            400,
            'VALIDATION_ERROR',
            'A partner is required to join the queue for doubles.'
          )
        }
      }

      if (matchType === 'doubles' && partnerId) {
        if (partnerId === playerId) {
          throw new EventQueueServiceError(
            400,
            'VALIDATION_ERROR',
            'You cannot partner with yourself.'
          )
        }
        await assertRegistered(registrations, eventId, partnerId)
      }

      return queue.create({
        event_id: eventId,
        player_id: playerId,
        match_type: matchType,
        // Normalised to null rather than passed through: a Mix & Match doubles
        // entry has no partner, and `undefined` would omit the column from the
        // insert entirely instead of writing an explicit "nobody".
        partner_id: matchType === 'doubles' ? (partnerId ?? null) : null
      })
    },

    async leaveQueue(eventId, playerId) {
      const existing = await queue.findByEventAndPlayer(eventId, playerId)
      if (!existing) {
        throw new EventQueueServiceError(404, 'NOT_QUEUED', 'You are not in the queue.')
      }
      await queue.leave(existing.id)
    },

    async matchEntries(actingPlayerId, eventId, queueId1, queueId2, courtNumber) {
      await assertOrganizer(events, eventId, actingPlayerId)

      if (queueId1 === queueId2) {
        throw new EventQueueServiceError(
          400,
          'VALIDATION_ERROR',
          'Select two different queue entries.'
        )
      }

      const [first, second] = await Promise.all([
        queue.findById(queueId1),
        queue.findById(queueId2)
      ])
      if (!first || !second || first.event_id !== eventId || second.event_id !== eventId) {
        throw new EventQueueServiceError(404, 'NOT_FOUND', 'Queue entry not found for this event.')
      }
      if (first.status !== 'waiting' || second.status !== 'waiting') {
        throw new EventQueueServiceError(
          409,
          'INVALID_QUEUE_STATE',
          'Both queue entries must be waiting to be matched.'
        )
      }

      const active = await queue.findByEvent(eventId)
      const courtTaken = active.some(
        (entry) =>
          entry.court_number === courtNumber &&
          (entry.status === 'matched' || entry.status === 'playing')
      )
      if (courtTaken) {
        throw new EventQueueServiceError(
          409,
          'COURT_IN_USE',
          `Court ${courtNumber} is already in use.`
        )
      }

      const [updatedFirst, updatedSecond] = await Promise.all([
        queue.setMatched(first.id, courtNumber, second.id),
        queue.setMatched(second.id, courtNumber, first.id)
      ])

      if (!updatedFirst || !updatedSecond) {
        throw new Error('Queue entries disappeared immediately after being matched.')
      }
      return { first: updatedFirst, second: updatedSecond }
    },

    async matchNextPair(actingPlayerId, eventId, courtNumber, matchType) {
      await assertOrganizer(events, eventId, actingPlayerId)

      // `findWaiting` already orders by joined_at ascending, so the head of this
      // list is first come, first served — the fairness the UI now claims.
      const waiting = await queue.findWaiting(eventId, matchType)

      // Singles cannot be paired against doubles. With no match type given, the
      // longest wait decides which format goes on next, and the pair is taken
      // from that format only.
      const first = waiting[0]
      if (!first) {
        throw new EventQueueServiceError(
          409,
          'INSUFFICIENT_QUEUE',
          'Nobody is waiting in the queue.'
        )
      }
      const second = waiting.find(
        (entry) => entry.id !== first.id && entry.match_type === first.match_type
      )
      if (!second) {
        throw new EventQueueServiceError(
          409,
          'INSUFFICIENT_QUEUE',
          `Only one ${first.match_type} entry is waiting; two are needed for a match.`
        )
      }

      // Delegates so the court-in-use and status checks live in exactly one
      // place rather than being restated here and drifting.
      return service.matchEntries(actingPlayerId, eventId, first.id, second.id, courtNumber)
    },

    async skipEntry(actingPlayerId, eventId, queueId) {
      await assertOrganizer(events, eventId, actingPlayerId)

      const entry = await queue.findById(queueId)
      if (!entry || entry.event_id !== eventId) {
        throw new EventQueueServiceError(404, 'NOT_FOUND', 'Queue entry not found for this event.')
      }
      if (entry.status !== 'waiting') {
        throw new EventQueueServiceError(
          409,
          'INVALID_QUEUE_STATE',
          'Only a waiting queue entry can be skipped.'
        )
      }

      const updated = await queue.updateStatus(queueId, 'skipped')
      if (!updated) throw new Error('Queue entry disappeared immediately after being updated.')
      return updated
    }
  }

  return service
}
