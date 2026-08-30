import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { createReportRepository } from '~/server/domains/moderation/repositories/report.repository'
import {
  createReportService,
  ReportServiceError
} from '~/server/domains/moderation/services/report.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import type { ReportResolution } from '~/server/domains/moderation/dto/report.dto'
import { apiError } from '~/server/utils/api-error'

const RESOLUTIONS: ReportResolution[] = ['dismissed', 'reviewed', 'actioned']

/**
 * Resolve a report. SuperAdmin only.
 *
 * `warn_player` sends the reported player a `moderation.warning` notification
 * built from the report's reason and the moderator's note - never from the
 * report row, which names the reporter. See ReportService.resolveReport.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to review reports.')
  }

  const reportId = getRouterParam(event, 'reportId')
  if (!reportId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Report ID is required.')
  }

  const client = serverSupabaseServiceRole(event)
  const platformAdmin = createPlatformAdminService(createPlatformConfigRepository(client))
  if (!(await platformAdmin.isSuperAdmin(claims.sub))) {
    throw apiError(403, 'FORBIDDEN', 'Only the platform SuperAdmin can review reports.')
  }

  type ResolveBody = { status?: unknown; resolution_note?: unknown; warn_player?: unknown }
  const body: ResolveBody = (await readBody<ResolveBody>(event).catch(() => undefined)) ?? {}

  if (!RESOLUTIONS.includes(body?.status as ReportResolution)) {
    throw apiError(400, 'VALIDATION_ERROR', `status must be one of: ${RESOLUTIONS.join(', ')}.`)
  }

  const service = createReportService(
    createReportRepository(client),
    createPlayerProfileRepository(client),
    createNotificationService(createNotificationRepository(client))
  )

  try {
    const report = await service.resolveReport(reportId, claims.sub, {
      status: body.status as ReportResolution,
      resolution_note: (body.resolution_note as string | null | undefined) ?? null,
      warn_player: body.warn_player === true
    })

    return { data: report, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof ReportServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[PATCH /api/v1/admin/reports/:reportId] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not resolve the report.')
  }
})
