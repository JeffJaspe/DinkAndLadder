import type { ShoutoutRepository } from '../repositories/shoutout.repository'
import type { ActivityLogger } from '../../activity/services/activity.service'
import type { ShoutoutDto, CreateShoutoutInput, UpdateShoutoutInput } from '../dto/shoutout.dto'
import { toShoutoutDto } from '../dto/shoutout.dto'
import { containsPhoneNumber } from './contact-info'

export class ShoutoutServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

function get24HoursFromNow(): string {
  const date = new Date()
  date.setHours(date.getHours() + 24)
  return date.toISOString()
}

const MAX_MESSAGE = 280

/**
 * Shared by create and update, which previously carried the same two checks
 * twice over - the surest way for a new rule to end up on one path only.
 *
 * Returns the trimmed message so callers cannot forget to trim it themselves.
 */
function validateMessage(message: string | undefined): string {
  if (!message || message.trim().length === 0) {
    throw new ShoutoutServiceError(400, 'VALIDATION_ERROR', 'Message is required.')
  }

  const trimmed = message.trim()

  if (trimmed.length > MAX_MESSAGE) {
    throw new ShoutoutServiceError(
      400,
      'VALIDATION_ERROR',
      `Message must be ${MAX_MESSAGE} characters or less.`
    )
  }

  // A shout-out is public and unmoderated, so a phone number in one is a
  // contact detail broadcast to strangers and permanently out of the poster's
  // hands. Arranging a game is what the app is for.
  if (containsPhoneNumber(trimmed)) {
    throw new ShoutoutServiceError(
      400,
      'CONTACT_INFO_NOT_ALLOWED',
      'Shout-outs cannot include phone numbers. Use a team-up or a duo request so people can reach you in the app.'
    )
  }

  return trimmed
}

export interface ShoutoutService {
  getActive(playerId: string): Promise<ShoutoutDto | null>
  create(playerId: string, input: CreateShoutoutInput): Promise<ShoutoutDto>
  update(playerId: string, input: UpdateShoutoutInput): Promise<ShoutoutDto>
}

export function createShoutoutService(
  shoutouts: ShoutoutRepository,
  activityLogger?: ActivityLogger
): ShoutoutService {
  return {
    async getActive(playerId) {
      const record = await shoutouts.findActiveByPlayerId(playerId)
      return record ? toShoutoutDto(record) : null
    },

    async create(playerId, input) {
      const message = validateMessage(input.message)
      const eventId = await validateEventLink(playerId, input.event_id)

      await shoutouts.deactivate(playerId)

      const record = await shoutouts.create({
        player_id: playerId,
        message,
        expires_at: get24HoursFromNow(),
        event_id: eventId
      })

      if (activityLogger) {
        await activityLogger.logShoutout(playerId, record.message, record.event_id)
      }

      return toShoutoutDto(record)
    },

    async update(playerId, input) {
      const message = validateMessage(input.message)
      const eventId = await validateEventLink(playerId, input.event_id)

      const existing = await shoutouts.findActiveByPlayerId(playerId)
      if (!existing) {
        throw new ShoutoutServiceError(404, 'NOT_FOUND', 'No active shout-out to update.')
      }

      const record = await shoutouts.update(playerId, {
        message,
        expires_at: get24HoursFromNow(),
        event_id: eventId
      })

      if (!record) {
        throw new ShoutoutServiceError(404, 'NOT_FOUND', 'No active shout-out to update.')
      }

      if (activityLogger) {
        await activityLogger.logShoutout(playerId, record.message, record.event_id)
      }

      return toShoutoutDto(record)
    }
  }

  /**
   * A shout-out may only point at an event the player created or is registered
   * for. Without this the field is an open redirect for attention: any event id
   * would attach, and a shout-out could advertise somebody else's tournament.
   */
  async function validateEventLink(
    playerId: string,
    eventId: string | null | undefined
  ): Promise<string | null> {
    if (!eventId) return null

    const allowed = await shoutouts.listLinkableEventIds(playerId)
    if (!allowed.has(eventId)) {
      throw new ShoutoutServiceError(
        403,
        'EVENT_NOT_LINKABLE',
        'You can only link an event you created or are registered for.'
      )
    }
    return eventId
  }
}
