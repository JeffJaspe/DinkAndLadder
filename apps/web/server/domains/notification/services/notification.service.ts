import type { NotificationRepository } from '../repositories/notification.repository'
import type {
  CreateNotificationInput,
  NotificationDto,
  NotificationQuery
} from '../dto/notification.dto'
import { toNotificationDto } from '../dto/notification.dto'
import { retentionCutoffs } from './notification-retention'

export class NotificationServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface NotificationService {
  notify(input: CreateNotificationInput): Promise<void>
  notifyMany(inputs: CreateNotificationInput[]): Promise<void>
  list(userId: string, query: NotificationQuery): Promise<NotificationDto[]>
  countUnread(userId: string): Promise<number>
  markAsRead(userId: string, notificationId: string): Promise<NotificationDto>
  markAllAsRead(userId: string): Promise<void>
  /**
   * Apply the retention policy platform-wide. Loops in batches until a sweep
   * comes back short or the batch ceiling is reached, so the first run against
   * a table that has never been pruned finishes in bounded work rather than one
   * enormous statement.
   */
  purgeExpired(options?: { batchSize?: number; maxBatches?: number }): Promise<number>
}

export function createNotificationService(repository: NotificationRepository): NotificationService {
  return {
    async notify(input) {
      try {
        await repository.create(input)
      } catch (err) {
        console.error(`[notification] failed to create notification for ${input.user_id}:`, err)
      }
    },

    async notifyMany(inputs) {
      if (inputs.length === 0) return
      try {
        await repository.createMany(inputs)
      } catch (err) {
        console.error(`[notification] failed to create ${inputs.length} notifications:`, err)
      }
    },

    async list(userId, query) {
      const records = await repository.list(userId, query)
      return records.map(toNotificationDto)
    },

    async countUnread(userId) {
      return repository.countUnread(userId)
    },

    async markAsRead(userId, notificationId) {
      const notification = await repository.findById(notificationId)
      if (!notification) {
        throw new NotificationServiceError(404, 'NOT_FOUND', 'Notification not found.')
      }
      if (notification.user_id !== userId) {
        throw new NotificationServiceError(
          403,
          'FORBIDDEN',
          'You can only mark your own notifications as read.'
        )
      }
      const updated = await repository.markAsRead(notificationId)
      return toNotificationDto(updated)
    },

    async markAllAsRead(userId) {
      await repository.markAllAsRead(userId)
    },

    async purgeExpired(options) {
      const batchSize = options?.batchSize ?? 500
      const maxBatches = options?.maxBatches ?? 40

      // The cutoffs are computed once, not per batch: a sweep that recomputed
      // "now" each round would move its own target mid-run, which makes the
      // result impossible to reason about in a log.
      const cutoffs = retentionCutoffs()

      let total = 0
      for (let batch = 0; batch < maxBatches; batch++) {
        const deleted = await repository.deleteExpired(cutoffs, batchSize)
        total += deleted
        if (deleted < batchSize) break
      }
      return total
    }
  }
}
