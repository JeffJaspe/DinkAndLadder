import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createBracketRepository } from '~/server/domains/event/repositories/bracket.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createTournamentCategoryRepository } from '~/server/domains/event/repositories/tournament-category.repository'
import {
  createBracketService,
  BracketServiceError
} from '~/server/domains/event/services/bracket.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import type { LiveBracketScore } from '~/server/domains/event/dto/bracket.dto'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * The running score of a draw match in progress.
 *
 * Called repeatedly while a match is played, so it is deliberately cheap: one
 * jsonb column, no match-domain work, no advancement. The score becomes a real
 * result only when the organiser submits it.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to enter a score.')
  }

  const bracketMatchId = getRouterParam(event, 'bracketMatchId')
  if (!bracketMatchId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Bracket match ID is required.')
  }

  type ScoreBody = { scores?: unknown }
  const body: ScoreBody = (await readBody<ScoreBody>(event).catch(() => undefined)) ?? {}

  if (!Array.isArray(body.scores)) {
    throw apiError(400, 'VALIDATION_ERROR', 'scores must be an array of games.')
  }

  const scores: LiveBracketScore[] = []
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

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'A player profile is required.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createBracketService(
    createBracketRepository(serviceClient),
    createTournamentRepository(serviceClient),
    createTournamentRegistrationRepository(serviceClient),
    createEventRepository(serviceClient),
    undefined,
    createTournamentCategoryRepository(serviceClient)
  )

  try {
    const bracketMatch = await service.updateBracketLiveScore(profile.id, bracketMatchId, scores)
    return { data: bracketMatch, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof BracketServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[PATCH /api/v1/bracket-matches/:id/score] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update the score.')
  }
})
