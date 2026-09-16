import { describe, it, expect, vi } from 'vitest'
import { createNotificationService } from '../../server/domains/notification/services/notification.service'
import { retentionCutoffs } from '../../server/domains/notification/services/notification-retention'
import { NOTIFICATION_RETENTION, RETENTION_NOTICE } from '../../utils/notification-retention'
import type { NotificationRepository } from '../../server/domains/notification/repositories/notification.repository'

function fakeRepo(overrides?: Partial<NotificationRepository>): NotificationRepository {
  return {
    create: vi.fn(),
    createMany: vi.fn(),
    findById: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    countUnread: vi.fn().mockResolvedValue(0),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteExpired: vi.fn().mockResolvedValue(0),
    ...overrides
  }
}

describe('notification retention policy', () => {
  it('starts the read clock later than the unread clock', () => {
    // Unread notifications must outlive read ones: nothing is deleted out from
    // under somebody who has not seen it yet.
    const now = new Date('2026-06-01T00:00:00Z')
    const { readBefore, createdBefore } = retentionCutoffs(now)

    expect(new Date(createdBefore).getTime()).toBeLessThan(new Date(readBefore).getTime())
  })

  it('computes both cutoffs from the policy', () => {
    const now = new Date('2026-06-01T00:00:00Z')
    const { readBefore, createdBefore } = retentionCutoffs(now)
    const day = 24 * 60 * 60 * 1000

    expect(new Date(readBefore).getTime()).toBe(
      now.getTime() - NOTIFICATION_RETENTION.readDays * day
    )
    expect(new Date(createdBefore).getTime()).toBe(
      now.getTime() - NOTIFICATION_RETENTION.unreadDays * day
    )
  })

  it('states the same numbers to the player that the sweep applies', () => {
    // The sentence on the notifications page and the sweep read one constant,
    // so a policy change cannot leave the page describing the old one.
    expect(RETENTION_NOTICE).toContain(String(NOTIFICATION_RETENTION.readDays))
    expect(RETENTION_NOTICE).toContain(String(NOTIFICATION_RETENTION.unreadDays))
  })
})

describe('NotificationService.purgeExpired', () => {
  it('keeps going while batches come back full', async () => {
    const deleteExpired = vi
      .fn()
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(120)
    const service = createNotificationService(fakeRepo({ deleteExpired }))

    const deleted = await service.purgeExpired({ batchSize: 500 })

    expect(deleted).toBe(1120)
    expect(deleteExpired).toHaveBeenCalledTimes(3)
  })

  it('stops at the batch ceiling rather than running unbounded', async () => {
    const deleteExpired = vi.fn().mockResolvedValue(100)
    const service = createNotificationService(fakeRepo({ deleteExpired }))

    const deleted = await service.purgeExpired({ batchSize: 100, maxBatches: 3 })

    expect(deleted).toBe(300)
    expect(deleteExpired).toHaveBeenCalledTimes(3)
  })

  it('uses one set of cutoffs for the whole sweep', async () => {
    // Recomputing "now" per batch would move the sweep's own target mid-run.
    const deleteExpired = vi.fn().mockResolvedValueOnce(500).mockResolvedValueOnce(10)
    const service = createNotificationService(fakeRepo({ deleteExpired }))

    await service.purgeExpired({ batchSize: 500 })

    expect(deleteExpired.mock.calls[0][0]).toEqual(deleteExpired.mock.calls[1][0])
  })

  it('does nothing when there is nothing expired', async () => {
    const deleteExpired = vi.fn().mockResolvedValue(0)
    const service = createNotificationService(fakeRepo({ deleteExpired }))

    expect(await service.purgeExpired()).toBe(0)
    expect(deleteExpired).toHaveBeenCalledTimes(1)
  })
})
