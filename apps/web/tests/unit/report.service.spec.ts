import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createReportService,
  ReportServiceError
} from '../../server/domains/moderation/services/report.service'
import type { ReportRepository } from '../../server/domains/moderation/repositories/report.repository'
import type { PlayerReportRecord } from '../../server/domains/moderation/dto/report.dto'
import type { PlayerProfileRepository } from '../../server/domains/player/repositories/player-profile.repository'
import type { NotificationService } from '../../server/domains/notification/services/notification.service'

const REPORTER = 'aaaaaaaa-0000-0000-0000-000000000001'
const REPORTED = 'bbbbbbbb-0000-0000-0000-000000000002'
const REPORTED_USER = 'cccccccc-0000-0000-0000-000000000003'
const MODERATOR_USER = 'dddddddd-0000-0000-0000-000000000004'

function makeReport(overrides: Partial<PlayerReportRecord> = {}): PlayerReportRecord {
  return {
    id: 'report-1',
    reporter_player_id: REPORTER,
    reported_player_id: REPORTED,
    reason: 'harassment',
    details: 'Abusive in the club chat',
    status: 'pending',
    reviewed_by_user_id: null,
    reviewed_at: null,
    resolution_note: null,
    created_at: '2026-08-30T00:00:00.000Z',
    updated_at: '2026-08-30T00:00:00.000Z',
    ...overrides
  }
}

function fakeReports(overrides: Partial<ReportRepository> = {}): ReportRepository {
  return {
    create: vi.fn(async (input) => makeReport({ ...input, details: input.details ?? null })),
    findById: vi.fn().mockResolvedValue(makeReport()),
    findOpenByPair: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    resolve: vi.fn(async (id, updates) => makeReport({ id, ...updates })),
    ...overrides
  } as ReportRepository
}

function fakePlayers(): PlayerProfileRepository {
  return {
    findById: vi.fn().mockResolvedValue({ id: REPORTED, user_id: REPORTED_USER })
  } as unknown as PlayerProfileRepository
}

let notified: Parameters<NotificationService['notify']>[0][]

function fakeNotifications(): NotificationService {
  notified = []
  return {
    notify: vi.fn(async (input) => {
      notified.push(input)
    }),
    notifyMany: vi.fn(),
    list: vi.fn(),
    countUnread: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn()
  } as unknown as NotificationService
}

beforeEach(() => {
  notified = []
})

describe('fileReport', () => {
  it('records a report against another player', async () => {
    const reports = fakeReports()
    const service = createReportService(reports, fakePlayers(), fakeNotifications())

    const result = await service.fileReport({
      reporter_player_id: REPORTER,
      reported_player_id: REPORTED,
      reason: 'cheating'
    })

    expect(result.reported_player_id).toBe(REPORTED)
    expect(reports.create).toHaveBeenCalledOnce()
  })

  it('never returns the reporter to the caller', async () => {
    const service = createReportService(fakeReports(), fakePlayers(), fakeNotifications())

    const result = await service.fileReport({
      reporter_player_id: REPORTER,
      reported_player_id: REPORTED,
      reason: 'spam'
    })

    // PlayerReportDto deliberately has no reporter field at all, so this would
    // only ever appear if someone widened the return type to the admin shape.
    expect(JSON.stringify(result)).not.toContain(REPORTER)
  })

  it('does NOT notify the reported player — a report is an accusation until reviewed', async () => {
    const service = createReportService(fakeReports(), fakePlayers(), fakeNotifications())

    await service.fileReport({
      reporter_player_id: REPORTER,
      reported_player_id: REPORTED,
      reason: 'harassment'
    })

    expect(notified).toHaveLength(0)
  })

  it('refuses a self-report', async () => {
    const service = createReportService(fakeReports(), fakePlayers(), fakeNotifications())

    await expect(
      service.fileReport({
        reporter_player_id: REPORTER,
        reported_player_id: REPORTER,
        reason: 'other'
      })
    ).rejects.toMatchObject({ code: 'CANNOT_REPORT_SELF' })
  })

  it('refuses an unknown reason', async () => {
    const service = createReportService(fakeReports(), fakePlayers(), fakeNotifications())

    await expect(
      service.fileReport({
        reporter_player_id: REPORTER,
        reported_player_id: REPORTED,
        // Deliberately invalid: the API layer checks too, but the service is
        // the boundary that must hold.
        reason: 'made_up' as never
      })
    ).rejects.toBeInstanceOf(ReportServiceError)
  })

  it('refuses a second open report about the same player', async () => {
    const reports = fakeReports({ findOpenByPair: vi.fn().mockResolvedValue(makeReport()) })
    const service = createReportService(reports, fakePlayers(), fakeNotifications())

    await expect(
      service.fileReport({
        reporter_player_id: REPORTER,
        reported_player_id: REPORTED,
        reason: 'no_show'
      })
    ).rejects.toMatchObject({ code: 'REPORT_ALREADY_OPEN' })
  })

  it('rejects details longer than the limit', async () => {
    const service = createReportService(fakeReports(), fakePlayers(), fakeNotifications())

    await expect(
      service.fileReport({
        reporter_player_id: REPORTER,
        reported_player_id: REPORTED,
        reason: 'other',
        details: 'x'.repeat(1001)
      })
    ).rejects.toBeInstanceOf(ReportServiceError)
  })
})

describe('resolveReport', () => {
  it('warns the reported player without naming the reporter', async () => {
    const service = createReportService(fakeReports(), fakePlayers(), fakeNotifications())

    await service.resolveReport('report-1', MODERATOR_USER, {
      status: 'actioned',
      warn_player: true
    })

    expect(notified).toHaveLength(1)
    const warning = notified[0]
    expect(warning.type).toBe('moderation.warning')
    expect(warning.user_id).toBe(REPORTED_USER)

    // The whole point of the feature: nothing in the notification can lead back
    // to who filed it.
    const wholeNotification = JSON.stringify(warning)
    expect(wholeNotification).not.toContain(REPORTER)
    expect(warning.body).toContain('Harassment')
  })

  it('includes the moderator note but still not the reporter', async () => {
    const service = createReportService(fakeReports(), fakePlayers(), fakeNotifications())

    await service.resolveReport('report-1', MODERATOR_USER, {
      status: 'actioned',
      resolution_note: 'Second complaint this month.',
      warn_player: true
    })

    expect(notified[0].body).toContain('Second complaint this month.')
    expect(JSON.stringify(notified[0])).not.toContain(REPORTER)
  })

  it('sends nothing when the report is dismissed', async () => {
    const service = createReportService(fakeReports(), fakePlayers(), fakeNotifications())

    await service.resolveReport('report-1', MODERATOR_USER, {
      status: 'dismissed',
      warn_player: true
    })

    // warn_player only applies to `actioned` — dismissing a report must never
    // warn the person it was about.
    expect(notified).toHaveLength(0)
  })

  it('sends nothing when the moderator did not ask to warn', async () => {
    const service = createReportService(fakeReports(), fakePlayers(), fakeNotifications())

    await service.resolveReport('report-1', MODERATOR_USER, { status: 'actioned' })

    expect(notified).toHaveLength(0)
  })

  it('refuses to resolve a report twice', async () => {
    const reports = fakeReports({
      findById: vi.fn().mockResolvedValue(makeReport({ status: 'dismissed' }))
    })
    const service = createReportService(reports, fakePlayers(), fakeNotifications())

    await expect(
      service.resolveReport('report-1', MODERATOR_USER, { status: 'actioned' })
    ).rejects.toMatchObject({ code: 'ALREADY_RESOLVED' })
  })

  it('404s on a report that does not exist', async () => {
    const reports = fakeReports({ findById: vi.fn().mockResolvedValue(null) })
    const service = createReportService(reports, fakePlayers(), fakeNotifications())

    await expect(
      service.resolveReport('nope', MODERATOR_USER, { status: 'dismissed' })
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('listForAdmin', () => {
  it('returns the reporter — this is the one surface allowed to', async () => {
    const reports = fakeReports({
      list: vi.fn().mockResolvedValue({ items: [makeReport()], total: 1 })
    })
    const service = createReportService(reports, fakePlayers(), fakeNotifications())

    const { items } = await service.listForAdmin({ limit: 25, offset: 0 })

    expect(items[0].reporter_player_id).toBe(REPORTER)
  })
})
