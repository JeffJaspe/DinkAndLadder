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
  /**
   * Delete expired notifications, up to `limit` rows, and report how many went.
   * Batched rather than one unbounded DELETE so the first sweep over a table
   * that has never been pruned cannot hold a long write lock or time the
   * request out; the caller loops until a batch comes back short.
   */
  deleteExpired(
    cutoffs: { readBefore: string; createdBefore: string },
    limit: number
  ): Promise<number>
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
    },

    async deleteExpired(cutoffs, limit) {
      // Two passes rather than one `.or()`: PostgREST's or() cannot express
      // "read and old" AND "unread and older" as two independent conjunctions,
      // and getting that wrong deletes unread notifications on the read clock.
      // Each pass selects its own ids first so the delete is by primary key and
      // bounded — the partial indexes from 065 cover both predicates.
      let deleted = 0

      for (const pass of [
        { column: 'read_at', notNull: true, before: cutoffs.readBefore },
        { column: 'created_at', notNull: false, before: cutoffs.createdBefore }
      ] as const) {
        const remaining = limit - deleted
        if (remaining <= 0) break

        let selection = client.from('notifications').select('id').limit(remaining)
        selection = pass.notNull
          ? selection.not('read_at', 'is', null).lt('read_at', pass.before)
          : selection.is('read_at', null).lt('created_at', pass.before)

        const { data, error } = await selection
        if (error) throw error

        const ids = (data ?? []).map((row) => (row as { id: string }).id)
        if (!ids.length) continue

        const { error: deleteError } = await client.from('notifications').delete().in('id', ids)
        if (deleteError) throw deleteError

        deleted += ids.length
      }

      return deleted
    }
  }
}
