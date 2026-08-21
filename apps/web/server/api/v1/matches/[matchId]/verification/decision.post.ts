import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import {
  createMatchService,
  MatchServiceError
} from '~/server/domains/match/services/match.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import {
  createRatingService,
  RatingServiceError
} from '~/server/domains/rating/services/rating.service'
import { createAuditRepository } from '~/server/domains/audit/repositories/audit.repository'
import { createAuditService } from '~/server/domains/audit/services/audit.service'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import type { NotificationType } from '~/server/domains/notification/dto/notification.dto'
import { createActivityRepository } from '~/server/domains/activity/repositories/activity.repository'
import { createActivityLogger } from '~/server/domains/activity/services/activity.service'
import { apiError } from '~/server/utils/api-error'
import type {
  MatchDto,
  RecordVerificationDecisionInput
} from '~/server/domains/match/dto/match.dto'
import type { RatingUpdateResult } from '~/server/domains/rating/dto/rating.dto'
import type { SupabaseClient } from '@supabase/supabase-js'

function parseDecisionInput(body: unknown): RecordVerificationDecisionInput {
  if (typeof body !== 'object' || body === null) {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be an object.')
  }
  const record = body as Record<string, unknown>

  if (
    record.status !== 'confirmed' &&
    record.status !== 'rejected' &&
    record.status !== 'disputed'
  ) {
    throw apiError(
      400,
      'VALIDATION_ERROR',
      "status must be 'confirmed', 'rejected', or 'disputed'."
    )
  }
  if (
    record.response_note !== undefined &&
    record.response_note !== null &&
    typeof record.response_note !== 'string'
  ) {
    throw apiError(400, 'VALIDATION_ERROR', 'response_note must be a string or null.')
  }

  return {
    status: record.status,
    response_note: (record.response_note as string | null | undefined) ?? null
  }
}

/**
 * Best-effort: a match's verification is already a complete, successful domain action in its
 * own right (see MatchService's own domain boundary) by the time this runs, so a rating
 * failure must never fail or roll back the verification response. The most likely failure —
 * RatingServiceError('PLAYER_UNRATED') — is an expected, known gap right now: the
 * initial-rating questionnaire (ADR-001, docs/18-ADR-INDEX.md) hasn't been built yet, so
 * brand-new players have no seeded rating for the engine to update from. Once that lands,
 * whatever process seeds those ratings is also responsible for re-running this for any match
 * that failed here — applyMatchResult is idempotent (see hasTransactionsForMatch) so replaying
 * it is always safe.
 *
 * Returns rating updates for activity/notification logging, or empty array if calculation failed.
 */
async function triggerRatingCalculation(match: MatchDto, client: SupabaseClient): Promise<RatingUpdateResult[]> {
  const service = createRatingService(createRatingRepository(client))
  const team1Points = match.scores.reduce((sum, s) => sum + s.team1_score, 0)
  const team2Points = match.scores.reduce((sum, s) => sum + s.team2_score, 0)

  try {
    const updates = await service.applyMatchResult({
      match_id: match.id,
      rating_type: match.match_type,
      participants: match.participants.map((p) => ({
        player_id: p.player_id,
        team_number: p.team_number
      })),
      team1_points: team1Points,
      team2_points: team2Points,
      played_at: match.played_at
    })
    return updates ?? []
  } catch (err) {
    if (err instanceof RatingServiceError) {
      console.warn(`[match ${match.id}] rating calculation skipped: ${err.code} — ${err.message}`)
      return []
    }
    console.error(`[match ${match.id}] rating calculation failed unexpectedly:`, err)
    return []
  }
}

/**
 * Records one verifier's decision. Same service-role rationale as the rest of the match
 * domain's writes — MatchService checks the caller is a designated, not-yet-responded verifier
 * before the bypass is used, and rejects self-verification (the submitter never gets a pending
 * row in the first place — see initiateVerification).
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to record a verification decision.')
  }

  const matchId = getRouterParam(event, 'matchId')
  if (!matchId) {
    throw apiError(400, 'VALIDATION_ERROR', 'matchId is required.')
  }

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(
      409,
      'PLAYER_PROFILE_REQUIRED',
      'Complete your player profile before verifying a match.'
    )
  }

  const input = parseDecisionInput(await readBody(event))
  const serviceClient = serverSupabaseServiceRole(event)
  const service = createMatchService(createMatchRepository(serviceClient))
  const auditService = createAuditService(createAuditRepository(serviceClient))
  const notificationService = createNotificationService(
    createNotificationRepository(serviceClient)
  )
  const playerRepo = createPlayerProfileRepository(serviceClient)

  try {
    const match = await service.recordVerificationDecision(playerProfile.id, matchId, input)

    await auditService.logMatchVerificationDecision(claims.sub, playerProfile.id, matchId, {
      decision: input.status,
      match_status: match.status
    })

    // Activity logger for feed
    const activityLogger = createActivityLogger(createActivityRepository(serviceClient))

    if (match.status === 'verified') {
      // Log match verified activity for all participants
      await Promise.all(
        match.participants.map((p) =>
          activityLogger.logMatchVerified(p.player_id, match.id, {
            match_type: match.match_type,
            opponent_ids: match.participants
              .filter((o) => o.team_number !== p.team_number)
              .map((o) => o.player_id)
          })
        )
      )

      // Trigger rating calculation and log rating changes
      const ratingUpdates = await triggerRatingCalculation(match, serviceClient)

      // Log rating changes as activities and send notifications
      for (const update of ratingUpdates) {
        await activityLogger.logRatingChanged(
          update.player_id,
          match.match_type,
          update.old_rating,
          update.new_rating
        )

        // Send rating.updated notification
        const profile = await playerRepo.findById(update.player_id)
        if (profile) {
          const direction = update.rating_delta > 0 ? 'increased' : 'decreased'
          await notificationService.notify({
            user_id: profile.user_id,
            type: 'rating.updated' as NotificationType,
            title: 'Rating Updated',
            body: `Your ${match.match_type} rating ${direction} from ${update.old_rating.toFixed(2)} to ${update.new_rating.toFixed(2)}.`,
            reference_type: 'player_rating',
            reference_id: update.player_id
          })
        }
      }
    }

    const terminalStates = ['verified', 'rejected', 'disputed'] as const
    if (terminalStates.includes(match.status as (typeof terminalStates)[number])) {
      const notificationType: NotificationType =
        match.status === 'verified'
          ? 'match.verified'
          : match.status === 'rejected'
            ? 'match.rejected'
            : 'match.disputed'
      const title =
        match.status === 'verified'
          ? 'Match Verified'
          : match.status === 'rejected'
            ? 'Match Rejected'
            : 'Match Disputed'
      const body =
        match.status === 'verified'
          ? `Your ${match.match_type} match has been verified and ratings have been updated.`
          : match.status === 'rejected'
            ? `A ${match.match_type} match you participated in was rejected.`
            : `A ${match.match_type} match you participated in has been disputed.`

      const participantNotifications = await Promise.all(
        match.participants.map(async (p) => {
          const profile = await playerRepo.findById(p.player_id)
          if (!profile) return null
          return {
            user_id: profile.user_id,
            type: notificationType,
            title,
            body,
            reference_type: 'match' as const,
            reference_id: matchId
          }
        })
      )

      await notificationService.notifyMany(
        participantNotifications.filter((n): n is NonNullable<typeof n> => n !== null)
      )
    }

    return {
      data: match,
      message: 'Verification decision recorded',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    if (err instanceof MatchServiceError) throw apiError(err.status, err.code, err.message)
    console.error(
      `[POST /api/v1/matches/${matchId}/verification/decision] recordVerificationDecision failed:`,
      err
    )
    throw apiError(500, 'INTERNAL_ERROR', 'Could not record your verification decision.')
  }
})
