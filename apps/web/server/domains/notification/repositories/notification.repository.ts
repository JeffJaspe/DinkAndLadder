import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateNotificationInput,
  NotificationQuery,
  NotificationRecord
} from '../dto/notification.dto'

const NOTIFICATION_COLUMNS =
  'id, user_id, type, title, body, reference_type, reference_id, read_at, created_at'

export interface NotificationRepository {
  create(input: CreateNotificationInput): Promise<NotificationRecord>
  createMany(inputs: CreateNotificationInput[]): Promise<NotificationRecord[]>
  findById(notificationId: string): Promise<NotificationRecord | null>
  list(userId: string, query: NotificationQuery): Promise<NotificationRecord[]>
  countUnread(userId: string): Promise<number>
  markAsRead(notificationId: string): Promise<NotificationRecord>
  markAllAsRead(userId: string): Promise<void>
}

export function createNotificationRepository(client: SupabaseClient): NotificationRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from('notifications')
        .insert({
          user_id: input.user_id,
          type: input.type,
          title: input.title,
          body: input.body,
          reference_type: input.reference_type ?? null,
          reference_id: input.reference_id ?? null
        })
        .select(NOTIFICATION_COLUMNS)
        .single()

      if (error) throw error
      return data as NotificationRecord
    },

    async createMany(inputs) {
      if (inputs.length === 0) return []

      const { data, error } = await client
        .from('notifications')
        .insert(
          inputs.map((input) => ({
            user_id: input.user_id,
            type: input.type,
            title: input.title,
            body: input.body,
            reference_type: input.reference_type ?? null,
            reference_id: input.reference_id ?? null
          }))
        )
        .select(NOTIFICATION_COLUMNS)

      if (error) throw error
      return (data ?? []) as NotificationRecord[]
    },

    async findById(notificationId) {
      const { data, error } = await client
        .from('notifications')
        .select(NOTIFICATION_COLUMNS)
        .eq('id', notificationId)
        .maybeSingle()

      if (error) throw error
      return data as NotificationRecord | null
    },

    async list(userId, query) {
      let builder = client.from('notifications').select(NOTIFICATION_COLUMNS).eq('user_id', userId)

      if (query.unread_only) {
        builder = builder.is('read_at', null)
      }

      builder = builder
        .order('created_at', { ascending: false })
        .range(query.offset, query.offset + query.limit - 1)

      const { data, error } = await builder

      if (error) throw error
      return (data ?? []) as NotificationRecord[]
    },

    async countUnread(userId) {
      const { count, error } = await client
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null)

      if (error) throw error
      return count ?? 0
    },

    async markAsRead(notificationId) {
      const { data, error } = await client
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .select(NOTIFICATION_COLUMNS)
        .single()

      if (error) throw error
      return data as NotificationRecord
    },

    async markAllAsRead(userId) {
      const { error } = await client
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null)

      if (error) throw error
    }
  }
}
