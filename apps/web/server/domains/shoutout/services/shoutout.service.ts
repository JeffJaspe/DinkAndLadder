import type { ShoutoutRepository } from '../repositories/shoutout.repository'
import type { ActivityLogger } from '../../activity/services/activity.service'
import type { ShoutoutDto, CreateShoutoutInput, UpdateShoutoutInput } from '../dto/shoutout.dto'
import { toShoutoutDto } from '../dto/shoutout.dto'

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

export interface ShoutoutService {
  getActive(playerId: string): Promise<ShoutoutDto | null>
  getRecent(limit?: number): Promise<ShoutoutDto[]>
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

    async getRecent(limit = 20) {
      const records = await shoutouts.findActiveWithPlayer(limit)
      return records.map((r) => {
        const dto = toShoutoutDto(r)
        dto.player = { id: r.player_id, display_name: r.display_name }
        return dto
      })
    },

    async create(playerId, input) {
      if (!input.message || input.message.trim().length === 0) {
        throw new ShoutoutServiceError(400, 'VALIDATION_ERROR', 'Message is required.')
      }

      if (input.message.length > 280) {
        throw new ShoutoutServiceError(
          400,
          'VALIDATION_ERROR',
          'Message must be 280 characters or less.'
        )
      }

      await shoutouts.deactivate(playerId)

      const record = await shoutouts.create({
        player_id: playerId,
        message: input.message.trim(),
        expires_at: get24HoursFromNow()
      })

      if (activityLogger) {
        await activityLogger.logShoutout(playerId, record.message)
      }

      return toShoutoutDto(record)
    },

    async update(playerId, input) {
      if (!input.message || input.message.trim().length === 0) {
        throw new ShoutoutServiceError(400, 'VALIDATION_ERROR', 'Message is required.')
      }

      if (input.message.length > 280) {
        throw new ShoutoutServiceError(
          400,
          'VALIDATION_ERROR',
          'Message must be 280 characters or less.'
        )
      }

      const existing = await shoutouts.findActiveByPlayerId(playerId)
      if (!existing) {
        throw new ShoutoutServiceError(404, 'NOT_FOUND', 'No active shout-out to update.')
      }

      const record = await shoutouts.update(playerId, {
        message: input.message.trim(),
        expires_at: get24HoursFromNow()
      })

      if (!record) {
        throw new ShoutoutServiceError(404, 'NOT_FOUND', 'No active shout-out to update.')
      }

      if (activityLogger) {
        await activityLogger.logShoutout(playerId, record.message)
      }

      return toShoutoutDto(record)
    }
  }
}
