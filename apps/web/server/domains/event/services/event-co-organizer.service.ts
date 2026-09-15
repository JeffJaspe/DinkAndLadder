import type { EventRepository } from '../repositories/event.repository'
import type { EventCoOrganizerRepository } from '../repositories/event-co-organizer.repository'
import type { EventCoOrganizerRecord } from '../dto/event-co-organizer.dto'
import { EventServiceError } from './event.service'

/**
 * The one question every organiser check now asks, answered once.
 *
 * Injected into EventService, the match endpoint and the result picker so
 * "may this person run this event" has a single definition: the creator, or
 * someone the creator appointed.
 */
export interface FriendCheck {
  isFriend(playerId: string, otherPlayerId: string): Promise<boolean>
}

export interface EventCoOrganizerService {
  list(eventId: string): Promise<EventCoOrganizerRecord[]>
  /** Creator or co-organiser. What "organiser" means everywhere below the creator-only rules. */
  isOrganizer(eventId: string, playerId: string): Promise<boolean>
  /**
   * Creator only, any time, friends only. The three rules the feature is.
   * Idempotent: appointing someone twice is not an error, it is the same
   * appointment.
   */
  add(actingPlayerId: string, eventId: string, playerId: string): Promise<EventCoOrganizerRecord>
  /** Creator only. Removing someone who is not there is a no-op. */
  remove(actingPlayerId: string, eventId: string, playerId: string): Promise<void>
}

export function createEventCoOrganizerService(
  events: EventRepository,
  coOrganizers: EventCoOrganizerRepository,
  friends: FriendCheck
): EventCoOrganizerService {
  async function assertCreator(actingPlayerId: string, eventId: string) {
    const event = await events.findById(eventId)
    if (!event) throw new EventServiceError(404, 'NOT_FOUND', 'Event not found.')
    if (event.created_by_player_id !== actingPlayerId) {
      throw new EventServiceError(
        403,
        'FORBIDDEN',
        'Only the person who created the event can change its co-organisers.'
      )
    }
    return event
  }

  return {
    list: (eventId) => coOrganizers.listByEvent(eventId),

    async isOrganizer(eventId, playerId) {
      const event = await events.findById(eventId)
      if (!event) return false
      if (event.created_by_player_id === playerId) return true
      return coOrganizers.isCoOrganizer(eventId, playerId)
    },

    async add(actingPlayerId, eventId, playerId) {
      const event = await assertCreator(actingPlayerId, eventId)
      if (playerId === event.created_by_player_id) {
        throw new EventServiceError(400, 'VALIDATION_ERROR', 'You already organise this event.')
      }
      if (!(await friends.isFriend(actingPlayerId, playerId))) {
        throw new EventServiceError(
          403,
          'NOT_A_FRIEND',
          'Co-organisers must be one of your duo partners or team-ups.'
        )
      }
      const existing = (await coOrganizers.listByEvent(eventId)).find(
        (row) => row.player_id === playerId
      )
      if (existing) return existing
      return coOrganizers.add(eventId, playerId, actingPlayerId)
    },

    async remove(actingPlayerId, eventId, playerId) {
      await assertCreator(actingPlayerId, eventId)
      await coOrganizers.remove(eventId, playerId)
    }
  }
}
