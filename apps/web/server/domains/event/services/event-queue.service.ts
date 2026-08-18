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
    throw new EventQueueServiceError(403, 'FORBIDDEN', 'Only the event organizer can manage the queue.')
  }
  return event
}

export function createEventQueueService(
  queue: EventQueueRepository,
  registrations: EventRegistrationRepository,
  events: EventRepository
): EventQueueService {
  return {
    async listQueue(eventId) {
      return queue.findByEvent(eventId)
    },

    async joinQueue(eventId, playerId, matchType, partnerId) {
      await assertRegistered(registrations, eventId, playerId)

      const existing = await queue.findByEventAndPlayer(eventId, playerId)
      if (existing) {
        throw new EventQueueServiceError(409, 'ALREADY_QUEUED', 'You are already in the queue.')
      }

      if (matchType === 'doubles') {
        if (!partnerId) {
          throw new EventQueueServiceError(
            400,
            'VALIDATION_ERROR',
            'A partner is required to join the queue for doubles.'
          )
        }
        if (partnerId === playerId) {
          throw new EventQueueServiceError(400, 'VALIDATION_ERROR', 'You cannot partner with yourself.')
        }
        await assertRegistered(registrations, eventId, partnerId)
      }

      return queue.create({
        event_id: eventId,
        player_id: playerId,
        match_type: matchType,
        partner_id: matchType === 'doubles' ? partnerId : null
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
        throw new EventQueueServiceError(400, 'VALIDATION_ERROR', 'Select two different queue entries.')
      }

      const [first, second] = await Promise.all([queue.findById(queueId1), queue.findById(queueId2)])
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
        throw new EventQueueServiceError(409, 'COURT_IN_USE', `Court ${courtNumber} is already in use.`)
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
}
