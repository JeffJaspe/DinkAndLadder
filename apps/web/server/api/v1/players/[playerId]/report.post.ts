import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { createReportRepository } from '~/server/domains/moderation/repositories/report.repository'
import {
  createReportService,
  ReportServiceError
} from '~/server/domains/moderation/services/report.service'
import { isReportReason } from '~/server/domains/moderation/dto/report.dto'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * File a report about another player. Goes to the SuperAdmin queue.
 *
 * Service-role client: the reporter's own RLS policy would let them insert
 * (player_reports_insert_own), but the service needs to read the reported
 * player's profile and check for an existing open report, and neither is
 * visible to the reporter under RLS. The reporter identity comes from the
 * session, never from the body.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to report a player.')
  }

  const reportedPlayerId = getRouterParam(event, 'playerId')
  if (!reportedPlayerId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Player ID is required.')
  }

  type ReportBody = { reason?: unknown; details?: unknown }
  // `?? {}` rather than `.catch(() => ({}))`: the latter widens the union with
  // an empty object literal and every field read then fails to typecheck.
  const body: ReportBody = (await readBody<ReportBody>(event).catch(() => undefined)) ?? {}
  if (!isReportReason(body?.reason)) {
    throw apiError(400, 'VALIDATION_ERROR', 'Pick a reason for the report.')
  }
  if (body.details !== undefined && body.details !== null && typeof body.details !== 'string') {
    throw apiError(400, 'VALIDATION_ERROR', 'details must be a string.')
  }

  const userClient = await serverSupabaseClient(event)
  const reporter = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!reporter) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createReportService(
    createReportRepository(serviceClient),
    createPlayerProfileRepository(serviceClient),
    createNotificationService(createNotificationRepository(serviceClient))
  )

  try {
    const report = await service.fileReport({
      reporter_player_id: reporter.id,
      reported_player_id: reportedPlayerId,
      reason: body.reason,
      details: (body.details as string | null | undefined) ?? null
    })

    return {
      data: report,
      message: 'Report submitted. The moderation team will review it.',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    if (err instanceof ReportServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[POST /api/v1/players/:playerId/report] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not submit the report.')
  }
})
