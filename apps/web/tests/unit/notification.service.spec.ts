import { describe, expect, it, vi } from 'vitest'
import { createNotificationService } from '../../server/domains/notification/services/notification.service'
import type { NotificationRepository } from '../../server/domains/notification/repositories/notification.repository'
import type { NotificationRecord } from '../../server/domains/notification/dto/notification.dto'

function makeRecord(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: 'notification-1',
    user_id: 'user-1',
    type: 'club.membership_approved',
    title: 'Welcome!',
    body: 'Your membership was approved.',
    reference_type: 'club_membership',
    reference_id: 'membership-1',
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides
  }
}

function createFakeRepository(): NotificationRepository & { records: NotificationRecord[] } {
  const records: NotificationRecord[] = []
  let idCounter = 0

  return {
    records,
    async create(input) {
      const record = makeRecord({
        id: `notification-${++idCounter}`,
        user_id: input.user_id,
        type: input.type,
        title: input.title,
        body: input.body,
        reference_type: input.reference_type ?? null,
        reference_id: input.reference_id ?? null
      })
      records.push(record)
      return record
    },
    async createMany(inputs) {
      return Promise.all(inputs.map((input) => this.create(input)))
    },
    async findById(id) {
      return records.find((r) => r.id === id) ?? null
    },
    async list(userId, query) {
      let filtered = records.filter((r) => r.user_id === userId)
      if (query.unread_only) {
        filtered = filtered.filter((r) => r.read_at === null)
      }
      return filtered.slice(query.offset, query.offset + query.limit)
    },
    async countUnread(userId) {
      return records.filter((r) => r.user_id === userId && r.read_at === null).length
    },
    async markAsRead(id) {
      const record = records.find((r) => r.id === id)
      if (!record) throw new Error('not found')
      record.read_at = new Date().toISOString()
      return record
    },
    async markAllAsRead(userId) {
      records
        .filter((r) => r.user_id === userId && r.read_at === null)
        .forEach((r) => {
          r.read_at = new Date().toISOString()
        })
    }
  }
}

describe('NotificationService', () => {
  it('creates a notification via notify()', async () => {
    const repo = createFakeRepository()
    const service = createNotificationService(repo)

    await service.notify({
      user_id: 'user-1',
      type: 'club.membership_approved',
      title: 'Welcome!',
      body: 'Your membership was approved.'
    })

    expect(repo.records).toHaveLength(1)
    expect(repo.records[0].type).toBe('club.membership_approved')
  })

  it('creates multiple notifications via notifyMany()', async () => {
    const repo = createFakeRepository()
    const service = createNotificationService(repo)

    await service.notifyMany([
      { user_id: 'user-1', type: 'club.membership_approved', title: 'A', body: 'A' },
      { user_id: 'user-2', type: 'match.verified', title: 'B', body: 'B' }
    ])

    expect(repo.records).toHaveLength(2)
  })

  it('does not throw when notify() fails (best-effort)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const repo: NotificationRepository = {
      ...createFakeRepository(),
      async create() {
        throw new Error('DB error')
      }
    }
    const service = createNotificationService(repo)

    await expect(
      service.notify({ user_id: 'u', type: 'club.membership_approved', title: 't', body: 'b' })
    ).resolves.not.toThrow()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('lists notifications for a user', async () => {
    const repo = createFakeRepository()
    repo.records.push(makeRecord({ id: 'n-1', user_id: 'user-1' }))
    repo.records.push(makeRecord({ id: 'n-2', user_id: 'user-1' }))
    repo.records.push(makeRecord({ id: 'n-3', user_id: 'user-2' }))
    const service = createNotificationService(repo)

    const list = await service.list('user-1', { limit: 10, offset: 0 })

    expect(list).toHaveLength(2)
    expect(list.every((n) => n.id.startsWith('n-'))).toBe(true)
  })

  it('counts unread notifications', async () => {
    const repo = createFakeRepository()
    repo.records.push(makeRecord({ id: 'n-1', user_id: 'user-1', read_at: null }))
    repo.records.push(
      makeRecord({ id: 'n-2', user_id: 'user-1', read_at: new Date().toISOString() })
    )
    repo.records.push(makeRecord({ id: 'n-3', user_id: 'user-1', read_at: null }))
    const service = createNotificationService(repo)

    const count = await service.countUnread('user-1')

    expect(count).toBe(2)
  })

  it('marks a notification as read', async () => {
    const repo = createFakeRepository()
    repo.records.push(makeRecord({ id: 'n-1', user_id: 'user-1', read_at: null }))
    const service = createNotificationService(repo)

    const updated = await service.markAsRead('user-1', 'n-1')

    expect(updated.read).toBe(true)
  })

  it('rejects marking another user notification as read', async () => {
    const repo = createFakeRepository()
    repo.records.push(makeRecord({ id: 'n-1', user_id: 'user-2', read_at: null }))
    const service = createNotificationService(repo)

    await expect(service.markAsRead('user-1', 'n-1')).rejects.toMatchObject({
      code: 'FORBIDDEN'
    })
  })

  it('rejects marking a non-existent notification as read', async () => {
    const repo = createFakeRepository()
    const service = createNotificationService(repo)

    await expect(service.markAsRead('user-1', 'non-existent')).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
  })

  it('marks all notifications as read', async () => {
    const repo = createFakeRepository()
    repo.records.push(makeRecord({ id: 'n-1', user_id: 'user-1', read_at: null }))
    repo.records.push(makeRecord({ id: 'n-2', user_id: 'user-1', read_at: null }))
    const service = createNotificationService(repo)

    await service.markAllAsRead('user-1')

    expect(repo.records.every((r) => r.read_at !== null)).toBe(true)
  })
})
