import type { NotificationRepository } from '../repositories/notification.repository'
import type {
  CreateNotificationInput,
  NotificationDto,
  NotificationQuery
} from '../dto/notification.dto'
import { toNotificationDto } from '../dto/notification.dto'

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
    }
  }
}
