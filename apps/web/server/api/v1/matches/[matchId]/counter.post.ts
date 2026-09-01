import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import {
  createMatchService,
  MatchServiceError
} from '~/server/domains/match/services/match.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createAuditRepository } from '~/server/domains/audit/repositories/audit.repository'
import { createAuditService } from '~/server/domains/audit/services/audit.service'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import { apiError } from '~/server/utils/api-error'
import type { SubmitMatchScoreInput } from '~/server/domains/match/dto/match.dto'
import { getOptionalUser } from '~/server/utils/optional-user'

function parseCounterInput(body: unknown): SubmitMatchScoreInput[] {
  if (typeof body !== 'object' || body === null) {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be an object.')
  }
  const record = body as Record<string, unknown>
  if (!Array.isArray(record.scores) || record.scores.length === 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'scores must be a non-empty array.')
  }

  return record.scores.map((s, i) => {
    const row = s as Record<string, unknown>
    if (
      typeof row.set_number !== 'number' ||
      typeof row.team1_score !== 'number' ||
      typeof row.team2_score !== 'number'
    ) {
      throw apiError(
        400,
        'VALIDATION_ERROR',
        `scores[${i}] must have numeric set_number, team1_score, team2_score.`
      )
    }
    return {
      set_number: row.set_number,
      team1_score: row.team1_score,
      team2_score: row.team2_score
    }
  })
}

/**
 * Records a proposed alternative score for a singles match and moves it to 'disputed' for
 * organizer/club review — see the scoping note on MatchService.proposeCounterScore for why
 * this doesn't attempt the full agree/counter negotiation loop yet.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to propose a different score.')
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
      'Complete your player profile before proposing a different score.'
    )
  }

  const scores = parseCounterInput(await readBody(event))
  const serviceClient = serverSupabaseServiceRole(event)
  const service = createMatchService(createMatchRepository(serviceClient))
  const auditService = createAuditService(createAuditRepository(serviceClient))
  const notificationService = createNotificationService(createNotificationRepository(serviceClient))
  const playerRepo = createPlayerProfileRepository(serviceClient)

  try {
    const match = await service.proposeCounterScore(playerProfile.id, matchId, scores)

    await auditService.log({
      event_type: 'match.score_counter_proposed',
      actor_user_id: claims.sub,
      actor_player_id: playerProfile.id,
      target_type: 'match',
      target_id: matchId,
      payload: { scores }
    })

    const otherParticipants = match.participants.filter((p) => p.player_id !== playerProfile.id)
    const notifications = await Promise.all(
      otherParticipants.map(async (p) => {
        const profile = await playerRepo.findById(p.player_id)
        if (!profile) return null
        return {
          user_id: profile.user_id,
          type: 'match.disputed' as const,
          title: 'Different Score Proposed',
          body: 'Your opponent proposed a different score for a match. The match has been marked disputed for review.',
          reference_type: 'match' as const,
          reference_id: matchId
        }
      })
    )
    await notificationService.notifyMany(
      notifications.filter((n): n is NonNullable<typeof n> => n !== null)
    )

    return { data: match, message: 'Different score proposed', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof MatchServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/matches/${matchId}/counter] proposeCounterScore failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not propose a different score.')
  }
})
