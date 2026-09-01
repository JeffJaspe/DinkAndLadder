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
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Puts a draw match on court and opens its scoreboard.
 *
 * Deliberately separate from recording the result: a started match has no
 * winner and no `matches` row, so nothing has entered anybody's record yet.
 * Spectators get a live score; the result still goes through `result.post.ts`
 * and its verification semantics.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to start a match.')
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
    const bracketMatch = await service.startBracketMatch(profile.id, bracketMatchId)
    return { data: bracketMatch, message: 'Match started', request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof BracketServiceError) throw apiError(err.status, err.code, err.message)
    console.error('[POST /api/v1/bracket-matches/:id/start] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not start the match.')
  }
})
