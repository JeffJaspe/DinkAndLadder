/**
 * Player reports (database/liquibase/037-moderation).
 *
 * Two DTOs on purpose, and the split is the whole security model of this
 * domain: `PlayerReportDto` never carries the reporter, `AdminPlayerReportDto`
 * does. Anything that is not the SuperAdmin queue takes the first, so leaking
 * the reporter takes a deliberate change of type rather than forgetting a
 * `delete` on an object literal.
 */

export type ReportReason =
  | 'harassment'
  | 'cheating'
  | 'fake_scores'
  | 'no_show'
  | 'inappropriate_content'
  | 'impersonation'
  | 'spam'
  | 'other'

export type ReportStatus = 'pending' | 'reviewed' | 'actioned' | 'dismissed'

export const REPORT_REASONS: ReportReason[] = [
  'harassment',
  'cheating',
  'fake_scores',
  'no_show',
  'inappropriate_content',
  'impersonation',
  'spam',
  'other'
]

/**
 * What the reported player is told, and what goes in the warning notification.
 *
 * Describes the behaviour, never the reporter. "Someone reported" is the most
 * specific this is ever allowed to get.
 */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or abusive behaviour',
  cheating: 'Cheating during play',
  fake_scores: 'Submitting false scores',
  no_show: 'Repeatedly not turning up',
  inappropriate_content: 'Inappropriate content',
  impersonation: 'Impersonating someone else',
  spam: 'Spam or unwanted promotion',
  other: 'Other'
}

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as string[]).includes(value)
}

export interface PlayerReportRecord {
  id: string
  reporter_player_id: string | null
  reported_player_id: string
  reason: string
  details: string | null
  status: string
  reviewed_by_user_id: string | null
  reviewed_at: string | null
  resolution_note: string | null
  created_at: string
  updated_at: string
}

/** Safe to return to the reporter. Carries no reporter identity of its own. */
export interface PlayerReportDto {
  id: string
  reported_player_id: string
  reason: string
  details: string | null
  status: string
  created_at: string
}

/** SuperAdmin only. The one shape that names the reporter. */
export interface AdminPlayerReportDto extends PlayerReportDto {
  reporter_player_id: string | null
  reviewed_by_user_id: string | null
  reviewed_at: string | null
  resolution_note: string | null
  updated_at: string
}

export function toPlayerReportDto(record: PlayerReportRecord): PlayerReportDto {
  return {
    id: record.id,
    reported_player_id: record.reported_player_id,
    reason: record.reason,
    details: record.details,
    status: record.status,
    created_at: record.created_at
  }
}

export function toAdminPlayerReportDto(record: PlayerReportRecord): AdminPlayerReportDto {
  return {
    ...toPlayerReportDto(record),
    reporter_player_id: record.reporter_player_id,
    reviewed_by_user_id: record.reviewed_by_user_id,
    reviewed_at: record.reviewed_at,
    resolution_note: record.resolution_note,
    updated_at: record.updated_at
  }
}

export interface CreatePlayerReportInput {
  reporter_player_id: string
  reported_player_id: string
  reason: ReportReason
  details?: string | null
}

/** What the SuperAdmin can do with a report. */
export type ReportResolution = 'dismissed' | 'reviewed' | 'actioned'

export interface ResolveReportInput {
  status: ReportResolution
  resolution_note?: string | null
  /**
   * Send the reported player a warning. Only meaningful for `actioned`; the
   * notification names the reason and never the reporter.
   */
  warn_player?: boolean
}
