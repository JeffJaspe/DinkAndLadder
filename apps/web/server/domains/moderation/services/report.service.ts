import type { ReportRepository } from '../repositories/report.repository'
import type { NotificationService } from '~/server/domains/notification/services/notification.service'
import type { PlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import {
  REPORT_REASON_LABELS,
  isReportReason,
  toAdminPlayerReportDto,
  toPlayerReportDto,
  type AdminPlayerReportDto,
  type CreatePlayerReportInput,
  type PlayerReportDto,
  type ReportReason,
  type ResolveReportInput
} from '../dto/report.dto'

export class ReportServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

const MAX_DETAILS = 1000

export interface ReportService {
  fileReport(input: CreatePlayerReportInput): Promise<PlayerReportDto>
  /** SuperAdmin queue. Authorization is the caller's job - see the API layer. */
  listForAdmin(options: {
    status?: string
    limit: number
    offset: number
  }): Promise<{ items: AdminPlayerReportDto[]; total: number }>
  resolveReport(
    reportId: string,
    reviewerUserId: string,
    input: ResolveReportInput
  ): Promise<AdminPlayerReportDto>
}

export function createReportService(
  reports: ReportRepository,
  players: PlayerProfileRepository,
  notifications: NotificationService
): ReportService {
  return {
    async fileReport(input) {
      if (!isReportReason(input.reason)) {
        throw new ReportServiceError(400, 'VALIDATION_ERROR', 'Pick a reason for the report.')
      }

      // Also a CHECK constraint (ck_player_reports_not_self), but a 400 with a
      // sentence beats a 500 carrying a constraint name.
      if (input.reporter_player_id === input.reported_player_id) {
        throw new ReportServiceError(400, 'CANNOT_REPORT_SELF', 'You cannot report yourself.')
      }

      const details = input.details?.trim() ?? ''
      if (details.length > MAX_DETAILS) {
        throw new ReportServiceError(
          400,
          'VALIDATION_ERROR',
          `Keep the details under ${MAX_DETAILS} characters.`
        )
      }

      const reported = await players.findById(input.reported_player_id)
      if (!reported) {
        throw new ReportServiceError(404, 'NOT_FOUND', 'That player does not exist.')
      }

      // Checked here as well as by uq_player_reports_open_pair so the answer is
      // a sentence rather than a unique-violation. The index is what actually
      // holds under a double submit.
      const existing = await reports.findOpenByPair(
        input.reporter_player_id,
        input.reported_player_id
      )
      if (existing) {
        throw new ReportServiceError(
          409,
          'REPORT_ALREADY_OPEN',
          'You have already reported this player. That report is still being reviewed.'
        )
      }

      const created = await reports.create({
        ...input,
        details: details.length > 0 ? details : null
      })

      // Deliberately no notification to the reported player here. A report is
      // an accusation until a moderator looks at it, and telling someone they
      // have been reported the moment anybody clicks the button turns the
      // feature into a harassment tool.
      return toPlayerReportDto(created)
    },

    async listForAdmin({ status, limit, offset }) {
      const { items, total } = await reports.list({ status, limit, offset })
      return { items: items.map(toAdminPlayerReportDto), total }
    },

    async resolveReport(reportId, reviewerUserId, input) {
      const report = await reports.findById(reportId)
      if (!report) {
        throw new ReportServiceError(404, 'NOT_FOUND', 'Report not found.')
      }
      if (report.status !== 'pending') {
        throw new ReportServiceError(
          409,
          'ALREADY_RESOLVED',
          'This report has already been reviewed.'
        )
      }

      const note = input.resolution_note?.trim() ?? ''
      const updated = await reports.resolve(reportId, {
        status: input.status,
        reviewed_by_user_id: reviewerUserId,
        resolution_note: note.length > 0 ? note : null
      })
      if (!updated) {
        throw new ReportServiceError(500, 'INTERNAL_ERROR', 'Could not resolve the report.')
      }

      if (input.warn_player && input.status === 'actioned') {
        await sendWarning(report.reported_player_id, report.reason, note, updated.id)
      }

      return toAdminPlayerReportDto(updated)
    }
  }

  /**
   * The warning the reported player receives.
   *
   * Built entirely from the reason code and the moderator's own note. The
   * report row is never read for the recipient's copy, and `reference_id`
   * points at a row RLS does not let them select - so there is no path from
   * this notification back to who reported them, which is the requirement.
   */
  async function sendWarning(
    reportedPlayerId: string,
    reason: string,
    moderatorNote: string,
    reportId: string
  ) {
    const profile = await players.findById(reportedPlayerId)
    if (!profile) return

    const label = REPORT_REASON_LABELS[reason as ReportReason] ?? 'Community guidelines'

    await notifications.notify({
      user_id: profile.user_id,
      type: 'moderation.warning',
      title: 'A warning about your account',
      // "Someone reported" is as specific as this is ever allowed to be.
      body: moderatorNote
        ? `Your account was reported for: ${label}. From the moderation team: ${moderatorNote}`
        : `Your account was reported for: ${label}. Please review the community guidelines - repeated reports can lead to your account being suspended.`,
      reference_type: 'player_report',
      reference_id: reportId
    })
  }
}
