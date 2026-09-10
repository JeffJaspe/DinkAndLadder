import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createBracketRepository } from '~/server/domains/event/repositories/bracket.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import {
  createBracketService,
  BracketServiceError
} from '~/server/domains/event/services/bracket.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createTournamentCategoryRepository } from '~/server/domains/event/repositories/tournament-category.repository'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const tournamentId = getRouterParam(event, 'tournamentId')
  if (!tournamentId) {
    throw apiError(400, 'MISSING_PARAMETER', 'tournamentId is required.')
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const bracketRepo = createBracketRepository(serviceClient)
  const tournamentRepo = createTournamentRepository(serviceClient)
  const registrationRepo = createTournamentRegistrationRepository(serviceClient)
  const eventRepo = createEventRepository(serviceClient)
  // The category repository is what lets generateBracket read the CATEGORY's
  // format rather than falling back to the tournament's for every draw.
  const service = createBracketService(
    bracketRepo,
    tournamentRepo,
    registrationRepo,
    eventRepo,
    undefined,
    createTournamentCategoryRepository(serviceClient)
  )

  const body = await readBody<{ category_id?: string }>(event).catch(() => undefined)
  const categoryId = body?.category_id

  try {
    const bracket = await service.generateBracket(profile.id, tournamentId, categoryId)
    return bracket
  } catch (err) {
    if (err instanceof BracketServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
