import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createBracketRepository } from '~/server/domains/event/repositories/bracket.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createTournamentCategoryRepository } from '~/server/domains/event/repositories/tournament-category.repository'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import {
  createBracketService,
  BracketServiceError
} from '~/server/domains/event/services/bracket.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * Freeze a draw, or reopen it.
 *
 * Locking is the hinge of the bracket lifecycle: it publishes the draw to
 * players and makes results recordable against it, and it stops the draw being
 * regenerated out from under people who have already been told who they play.
 *
 * `{ locked: false }` reopens, and is refused once any result exists — at that
 * point the draw is part of the record of what happened.
 */
export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const tournamentId = getRouterParam(event, 'tournamentId')
  if (!tournamentId) {
    throw createError({ statusCode: 400, statusMessage: 'tournamentId is required.' })
  }

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createBracketService(
    createBracketRepository(serviceClient),
    createTournamentRepository(serviceClient),
    createTournamentRegistrationRepository(serviceClient),
    createEventRepository(serviceClient),
    createMatchRepository(serviceClient),
    createTournamentCategoryRepository(serviceClient)
  )

  const body = await readBody<{ category_id?: string; locked?: boolean }>(event).catch(
    () => undefined
  )
  // Default true: the overwhelmingly common call is "lock this".
  const wantLocked = body?.locked !== false

  try {
    return wantLocked
      ? await service.lockBracket(profile.id, tournamentId, body?.category_id)
      : await service.unlockBracket(profile.id, tournamentId, body?.category_id)
  } catch (err) {
    if (err instanceof BracketServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
