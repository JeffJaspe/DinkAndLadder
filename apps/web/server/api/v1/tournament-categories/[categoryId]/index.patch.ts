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
import type { UpdateTournamentCategoryInput } from '~/server/domains/event/dto/tournament-category.dto'

/**
 * Routed off the category id rather than nested under the tournament: a
 * category id is already unique, and the service resolves the parent tournament
 * itself to check the caller is the organiser.
 *
 * The registration repository is passed in because updateCategory refuses to
 * shrink a category below the number of players already confirmed into it.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to edit a category.')
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

  const body = await readBody<UpdateTournamentCategoryInput>(event)
  if (!body || typeof body !== 'object') {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be an object.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createTournamentCategoryService(
    createTournamentCategoryRepository(serviceClient),
    createTournamentRepository(serviceClient),
    createEventRepository(serviceClient),
    createTournamentRegistrationRepository(serviceClient)
  )

  try {
    const category = await service.updateCategory(profile.id, categoryId, {
      name: body.name,
      min_rating: body.min_rating,
      max_rating: body.max_rating,
      max_participants: body.max_participants,
      display_order: body.display_order,
      status: body.status
    })
    return { data: category, request_id: crypto.randomUUID() }
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    console.error(`[PATCH /api/v1/tournament-categories/${categoryId}] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update the category.')
  }
})
