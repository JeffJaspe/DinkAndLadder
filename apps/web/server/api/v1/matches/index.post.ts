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
import { createEventRegistrationRepository } from '~/server/domains/event/repositories/event-registration.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import type { MatchResultType, SubmittedByRole } from '~/utils/game-rules'
import { apiError } from '~/server/utils/api-error'
import type {
  SubmitMatchInput,
  SubmitMatchParticipantInput,
  SubmitMatchScoreInput
} from '~/server/domains/match/dto/match.dto'

function parseSubmitInput(body: unknown): SubmitMatchInput {
  if (typeof body !== 'object' || body === null) {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be an object.')
  }
  const record = body as Record<string, unknown>

  if (typeof record.event_id !== 'string' || !record.event_id) {
    throw apiError(400, 'VALIDATION_ERROR', 'event_id is required.')
  }
  if (record.match_type !== 'singles' && record.match_type !== 'doubles') {
    throw apiError(400, 'VALIDATION_ERROR', "match_type must be 'singles' or 'doubles'.")
  }
  if (typeof record.played_at !== 'string' || Number.isNaN(Date.parse(record.played_at))) {
    throw apiError(400, 'VALIDATION_ERROR', 'played_at is required and must be a valid date/time.')
  }
  if (!Array.isArray(record.participants) || record.participants.length === 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'participants must be a non-empty array.')
  }
  if (!Array.isArray(record.scores) || record.scores.length === 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'scores must be a non-empty array.')
  }

  const participants: SubmitMatchParticipantInput[] = record.participants.map((p, i) => {
    const row = p as Record<string, unknown>
    if (typeof row.player_id !== 'string') {
      throw apiError(400, 'VALIDATION_ERROR', `participants[${i}].player_id must be a string.`)
    }
    if (row.team_number !== 1 && row.team_number !== 2) {
      throw apiError(400, 'VALIDATION_ERROR', `participants[${i}].team_number must be 1 or 2.`)
    }
    return { player_id: row.player_id, team_number: row.team_number }
  })

  const scores: SubmitMatchScoreInput[] = record.scores.map((s, i) => {
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

  const venue = record.venue
  if (venue !== undefined && venue !== null && typeof venue !== 'string') {
    throw apiError(400, 'VALIDATION_ERROR', 'venue must be a string or null.')
  }

  const resultType = record.result_type ?? 'normal'
  if (!['normal', 'retired', 'dq', 'walkover'].includes(resultType as string)) {
    throw apiError(400, 'VALIDATION_ERROR', "result_type must be normal, retired, dq or walkover.")
  }
  if (record.winner_team !== undefined && record.winner_team !== null && record.winner_team !== 1 && record.winner_team !== 2) {
    throw apiError(400, 'VALIDATION_ERROR', 'winner_team must be 1, 2 or null.')
  }

  return {
    event_id: record.event_id as string,
    match_type: record.match_type,
    played_at: record.played_at,
    venue: (venue as string | null | undefined) ?? null,
    result_type: resultType as MatchResultType,
    winner_team: (record.winner_team as 1 | 2 | null | undefined) ?? null,
    participants,
    scores
  }
}

/**
 * Uses the service-role client: submitting a match inherently creates match_participants
 * rows for OTHER players, which no self-service RLS policy can express (see 008-security's
 * note on the match domain). Authorization: caller must be registered to the event and
 * be one of the listed participants — checked in MatchService.submitMatch.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to submit a match.')
  }

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(
      409,
      'PLAYER_PROFILE_REQUIRED',
      'Complete your player profile before submitting a match.'
    )
  }

  const input = parseSubmitInput(await readBody(event))

  const serviceClient = serverSupabaseServiceRole(event)

  /**
   * Which of the three parties this is.
   *
   * Three are involved in any match — team 1, team 2 and the organiser — and
   * any of them may report the score. Only the server can tell which, so it is
   * resolved here rather than trusted from the body.
   *
   * The organiser branch is what registration used to block: they are running
   * the desk, not playing, so they hold no registration and were refused before
   * the service ever saw the request.
   */
  const eventRow = await createEventRepository(serviceClient).findById(input.event_id)
  if (!eventRow) {
    throw apiError(404, 'NOT_FOUND', 'Event not found.')
  }

  const isOrganizer = eventRow.created_by_player_id === playerProfile.id
  let role: SubmittedByRole = 'organizer'

  if (!isOrganizer) {
    const registrationRepo = createEventRegistrationRepository(userClient)
    const registration = await registrationRepo.findByEventAndPlayer(
      input.event_id,
      playerProfile.id
    )
    if (!registration || registration.status === 'withdrawn') {
      throw apiError(
        403,
        'NOT_REGISTERED',
        'You must be registered to this event to submit matches.'
      )
    }
    // Which side they played on, so the record says who reported it.
    const own = input.participants.find((p) => p.player_id === playerProfile.id)
    role = own?.team_number === 2 ? 'team_2' : 'team_1'
  }

  const service = createMatchService(createMatchRepository(serviceClient))

  try {
    const match = await service.submitMatch(playerProfile.id, input, role)
    return { data: match, message: 'Match submitted', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof MatchServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[POST /api/v1/matches] submitMatch failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not submit the match.')
  }
})
