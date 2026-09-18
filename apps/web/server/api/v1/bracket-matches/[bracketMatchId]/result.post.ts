import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { awardAchievementsForPlayers } from '~/server/utils/award-achievements'
import { createBracketRepository } from '~/server/domains/event/repositories/bracket.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import { createTournamentCategoryRepository } from '~/server/domains/event/repositories/tournament-category.repository'
import {
  createBracketService,
  BracketServiceError
} from '~/server/domains/event/services/bracket.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createRatingService } from '~/server/domains/rating/services/rating.service'
import { apiError } from '~/server/utils/api-error'
import type { RecordBracketResultInput } from '~/server/domains/event/dto/bracket.dto'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Records what happened in one slot of a draw.
 *
 * A POST rather than a PATCH on the bracket match: this creates a match, links
 * it, settles the slot and advances the winner. That is a new thing coming into
 * existence, not a field being edited — and it is deliberately not idempotent,
 * so a double submit is refused with RESULT_ALREADY_RECORDED rather than
 * quietly creating a second match for the same slot.
 *
 * Service role for the writes, exactly as the sibling PATCH does: the organiser
 * check is the service's job and the inserts span two domains' tables.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to record a result.')
  }

  const bracketMatchId = getRouterParam(event, 'bracketMatchId')
  if (!bracketMatchId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Bracket match ID is required.')
  }

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'A player profile is required.')
  }

  const body = await readBody<RecordBracketResultInput>(event)
  if (!body || typeof body !== 'object') {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be an object.')
  }
  if (!body.winner_registration_id) {
    throw apiError(400, 'VALIDATION_ERROR', 'Say which entrant won.')
  }
  if (!Array.isArray(body.scores)) {
    throw apiError(400, 'VALIDATION_ERROR', 'Scores must be a list of sets.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createBracketService(
    createBracketRepository(serviceClient),
    createTournamentRepository(serviceClient),
    createTournamentRegistrationRepository(serviceClient),
    createEventRepository(serviceClient),
    createMatchRepository(serviceClient),
    createTournamentCategoryRepository(serviceClient),
    // Recording a draw result marks the match verified, and a verified match
    // has to move ratings. This is the only bracket endpoint that needs it —
    // the others read or generate a draw and rate nothing.
    createRatingService(createRatingRepository(serviceClient))
  )

  try {
    const bracketMatch = await service.recordMatchResult(profile.id, bracketMatchId, {
      winner_registration_id: body.winner_registration_id,
      scores: body.scores
    })

    // A draw result is a verified match, and the service rates it — but the
    // badge evaluator lives in the API layer (it crosses into notifications),
    // so it has to be called from here. Without this a tournament win, a
    // first match and every count-based milestone earned on a bracket sat as
    // "requirement met" until something else re-ran the evaluator. Best-effort:
    // the result is already recorded and advanced.
    const players = [bracketMatch.participant1, bracketMatch.participant2].flatMap((side) =>
      side ? [side.player_id, side.partner_player_id] : []
    )
    const profiles = createPlayerProfileRepository(serviceClient)
    await awardAchievementsForPlayers(
      serviceClient,
      await Promise.all(
        players
          .filter((id): id is string => !!id)
          .map(async (playerId) => ({
            playerId,
            userId: (await profiles.findById(playerId))?.user_id ?? null
          }))
      )
    )

    return { data: bracketMatch, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof BracketServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    console.error(`[POST /api/v1/bracket-matches/${bracketMatchId}/result] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not record the result.')
  }
})
