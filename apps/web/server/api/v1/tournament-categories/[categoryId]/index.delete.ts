import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRegistrationRepository,
  createTournamentRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createTournamentCategoryRepository } from '~/server/domains/event/repositories/tournament-category.repository'
import { createTournamentCategoryService } from '~/server/domains/event/services/tournament-category.service'
import { EventServiceError } from '~/server/domains/event/services/event.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Bin a category that is not going to be played.
 *
 * A hard delete of the category, its entries and its draw — not a soft one. The
 * project's rule is that soft deletion is for personal data and for records of
 * things that happened; a postponed category is neither, and leaving tombstones
 * behind only grows the tables the event pages read on every visit.
 *
 * The service refuses once any result exists, because at that point the
 * category IS a record of something that happened, and the matches behind those
 * results have already moved people's ratings.
 *
 * Service role: `tournament_categories` and `bracket_matches` are select-only
 * under RLS, the same reason the event delete endpoint uses it.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to remove a category.')
  }

  const categoryId = getRouterParam(event, 'categoryId')
  if (!categoryId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Category ID is required.')
  }

  const client = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'A player profile is required.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createTournamentCategoryService(
    createTournamentCategoryRepository(serviceClient),
    createTournamentRepository(serviceClient),
    createEventRepository(serviceClient),
    createTournamentRegistrationRepository(serviceClient)
  )

  try {
    await service.deleteCategory(profile.id, categoryId)
    setResponseStatus(event, 204)
    return null
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    console.error(`[DELETE /api/v1/tournament-categories/${categoryId}] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not remove the category.')
  }
})
