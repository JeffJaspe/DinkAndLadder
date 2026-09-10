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
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

/**
 * Undo Generate: throw the draw away and go back to "not drawn yet".
 *
 * Regenerating already replaced a draw wholesale, so this adds no destructive
 * power that did not already exist — what it adds is a way back to the state
 * before Generate, which was unreachable once the button had been pressed even
 * once by mistake.
 *
 * Refused on a locked draw, and refused once any result exists: the service
 * explains both.
 */
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
  const profile = await createPlayerProfileRepository(client).findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
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

  const body = await readBody<{ category_id?: string }>(event).catch(() => undefined)

  try {
    await service.undoBracket(profile.id, tournamentId, body?.category_id)
    setResponseStatus(event, 204)
    return null
  } catch (err) {
    if (err instanceof BracketServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
