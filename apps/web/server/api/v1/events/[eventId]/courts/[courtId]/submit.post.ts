import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createEventCourtRepository } from '~/server/domains/event/repositories/event-court.repository'
import { createEventQueueRepository } from '~/server/domains/event/repositories/event-queue.repository'
import { createEventRegistrationRepository } from '~/server/domains/event/repositories/event-registration.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createEventCourtService,
  EventCourtServiceError
} from '~/server/domains/event/services/event-court.service'
import {
  createEventQueueService,
  EventQueueServiceError
} from '~/server/domains/event/services/event-queue.service'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import {
  createMatchService,
  MatchServiceError
} from '~/server/domains/match/services/match.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import type { SubmitMatchParticipantInput } from '~/server/domains/match/dto/match.dto'
import type { EventQueueRecord } from '~/server/domains/event/dto/event.dto'
import { assertCanRunEvent, assertEventIsRunning } from '~/server/utils/event-organizer'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Submit the final score on a court.
 *
 * Three things happen, in this order and for this reason:
 *
 *   1. The court is freed and the queue entries closed (finishCourt). Doing
 *      this first means a failure in step 2 leaves the organiser with an empty
 *      court they can restart, rather than a court permanently stuck on a game
 *      nobody is able to end.
 *   2. A real `matches` row is created through MatchService, so open play
 *      results go through exactly the same submission and verification path as
 *      a manually recorded match. Nothing here writes to `matches` directly.
 *   3. The next waiting pair is pulled onto the court automatically, which is
 *      the whole point of running a session off a queue.
 *
 * Steps 2 and 3 are best-effort *relative to step 1*: the score is what matters
 * and the court must not stay blocked. Failures are reported in the response
 * rather than swallowed, so the desk knows to record the match by hand.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to submit a score.')
  }

  const eventId = getRouterParam(event, 'eventId')
  const courtId = getRouterParam(event, 'courtId')
  if (!eventId || !courtId) {
    throw apiError(400, 'VALIDATION_ERROR', 'eventId and courtId are required.')
  }

  const userClient = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const eventRow = await assertCanRunEvent(serviceClient, eventId, profile.id)
  assertEventIsRunning(eventRow)

  const courtRepo = createEventCourtRepository(serviceClient)
  const queueRepo = createEventQueueRepository(serviceClient)
  const eventRepo = createEventRepository(serviceClient)

  const courtService = createEventCourtService(courtRepo, queueRepo, eventRepo)

  let finished
  try {
    finished = await courtService.finishCourt(courtId)
  } catch (err) {
    if (err instanceof EventCourtServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[POST /api/v1/events/${eventId}/courts/${courtId}/submit] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not submit the score.')
  }

  const { court, team1, team2, finalScore } = finished

  // --- 2. The real match ------------------------------------------------------
  let matchId: string | null = null
  let matchError: string | null = null

  if (team1 && team2) {
    try {
      const matchService = createMatchService(createMatchRepository(serviceClient))
      const match = await matchService.submitMatch(profile.id, {
        event_id: eventId,
        match_type: team1.match_type,
        played_at: new Date().toISOString(),
        participants: participantsFor(team1, team2),
        // The live score is already game-by-game in the shape match submission
        // wants; only the field name differs.
        scores: finalScore.map((game) => ({
          set_number: game.game_number,
          team1_score: game.team1_score,
          team2_score: game.team2_score
        }))
      })
      matchId = match.id
    } catch (err) {
      matchError =
        err instanceof MatchServiceError
          ? err.message
          : 'The score was saved but the match could not be recorded.'
      console.error(`[courts/${courtId}/submit] match creation failed:`, err)
    }
  }

  // --- 3. Next pair on ---------------------------------------------------------
  let nextUp = null
  let queueError: string | null = null

  try {
    const queueService = createEventQueueService(
      queueRepo,
      createEventRegistrationRepository(serviceClient),
      eventRepo
    )
    nextUp = await queueService.matchNextPair(profile.id, eventId, court.court_number)
  } catch (err) {
    // Nothing waiting is the ordinary case at the end of a session, not a
    // failure worth surfacing as an error.
    if (err instanceof EventQueueServiceError && err.status === 404) {
      queueError = null
    } else {
      queueError = 'Could not put the next pair on.'
      console.error(`[courts/${courtId}/submit] auto-advance failed:`, err)
    }
  }

  return {
    data: await courtRepo.findById(courtId),
    match_id: matchId,
    next_up: nextUp,
    // Surfaced rather than swallowed: if the match did not record, the desk
    // needs to know now, while the players are still standing there.
    warnings: [matchError, queueError].filter(Boolean),
    message: 'Score submitted',
    request_id: crypto.randomUUID()
  }
})

/**
 * Queue entries to match participants.
 *
 * A doubles queue entry carries the player and their partner on one row, so a
 * side is one or two people depending on the format.
 */
function participantsFor(
  team1: EventQueueRecord,
  team2: EventQueueRecord
): SubmitMatchParticipantInput[] {
  const side = (entry: EventQueueRecord, teamNumber: 1 | 2): SubmitMatchParticipantInput[] =>
    [entry.player_id, entry.partner_id]
      .filter((id): id is string => !!id)
      .map((player_id) => ({ player_id, team_number: teamNumber }))

  return [...side(team1, 1), ...side(team2, 2)]
}
