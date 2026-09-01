import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createEventCourtRepository } from '~/server/domains/event/repositories/event-court.repository'
import { createEventQueueRepository } from '~/server/domains/event/repositories/event-queue.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createEventCourtService,
  EventCourtServiceError
} from '~/server/domains/event/services/event-court.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import type { LiveGameScore } from '~/server/domains/event/dto/event.dto'
import { assertCanRunEvent, assertEventIsRunning } from '~/server/utils/event-organizer'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Update the running score on a court.
 *
 * Called repeatedly while a game is in progress, so it is deliberately cheap:
 * it writes one jsonb column and does no match-domain work at all. The score
 * only becomes a `matches` row when the organiser submits it.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to enter a score.')
  }

  const eventId = getRouterParam(event, 'eventId')
  const courtId = getRouterParam(event, 'courtId')
  if (!eventId || !courtId) {
    throw apiError(400, 'VALIDATION_ERROR', 'eventId and courtId are required.')
  }

  type ScoreBody = { scores?: unknown }
  const body: ScoreBody = (await readBody<ScoreBody>(event).catch(() => undefined)) ?? {}

  if (!Array.isArray(body.scores)) {
    throw apiError(400, 'VALIDATION_ERROR', 'scores must be an array of games.')
  }

  const scores: LiveGameScore[] = []
  for (const raw of body.scores) {
    const game = raw as Record<string, unknown>
    if (
      typeof game?.game_number !== 'number' ||
      typeof game?.team1_score !== 'number' ||
      typeof game?.team2_score !== 'number'
    ) {
      throw apiError(
        400,
        'VALIDATION_ERROR',
        'Each game needs game_number, team1_score and team2_score.'
      )
    }
    scores.push({
      game_number: game.game_number,
      team1_score: game.team1_score,
      team2_score: game.team2_score
    })
  }

  const userClient = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const eventRow = await assertCanRunEvent(serviceClient, eventId, profile.id)
  assertEventIsRunning(eventRow)

  const service = createEventCourtService(
    createEventCourtRepository(serviceClient),
    createEventQueueRepository(serviceClient),
    createEventRepository(serviceClient)
  )

  try {
    const court = await service.updateLiveScore(courtId, scores)
    return { data: court, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof EventCourtServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[PATCH /api/v1/events/${eventId}/courts/${courtId}/score] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update the score.')
  }
})
