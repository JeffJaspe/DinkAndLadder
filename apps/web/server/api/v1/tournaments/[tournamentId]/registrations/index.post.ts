import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import {
  createEventService,
  EventServiceError
} from '~/server/domains/event/services/event.service'
import type { RegisterForTournamentInput } from '~/server/domains/event/dto/tournament.dto'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createTournamentCategoryRepository } from '~/server/domains/event/repositories/tournament-category.repository'
import { createRatingRepository } from '~/server/domains/rating/repositories/rating.repository'
import { createRatingService } from '~/server/domains/rating/services/rating.service'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const tournamentId = getRouterParam(event, 'tournamentId')
  if (!tournamentId) {
    throw createError({ statusCode: 400, statusMessage: 'tournamentId is required.' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const body = await readBody<RegisterForTournamentInput>(event)

  const serviceClient = serverSupabaseServiceRole(event)
  const eventRepo = createEventRepository(serviceClient)
  const tournamentRepo = createTournamentRepository(serviceClient)
  const registrationRepo = createTournamentRegistrationRepository(serviceClient)
  const service = createEventService(eventRepo, tournamentRepo, registrationRepo)

  const categoryId = body?.category_id ?? null

  try {
    // Category rating-eligibility check lives here rather than in EventService — it
    // crosses into the rating domain, and EventService's factory is called from 14
    // other controllers that have no reason to depend on it.
    if (categoryId) {
      const categoryRepo = createTournamentCategoryRepository(serviceClient)
      const category = await categoryRepo.findById(categoryId)
      if (!category || category.tournament_id !== tournamentId) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Category not found for this tournament.'
        })
      }
      if (category.min_rating != null || category.max_rating != null) {
        const tournament = await tournamentRepo.findById(tournamentId)
        const ratingService = createRatingService(createRatingRepository(serviceClient))
        const rating = tournament
          ? await ratingService.getRating(profile.id, tournament.match_type)
          : null
        const ratingValue = rating?.rating_value ?? null
        if (ratingValue == null) {
          throw createError({
            statusCode: 400,
            statusMessage: 'A rating is required to register for this category.'
          })
        }
        if (category.min_rating != null && ratingValue < category.min_rating) {
          throw createError({
            statusCode: 400,
            statusMessage: `Your rating is below this category's minimum (${category.min_rating}).`
          })
        }
        if (category.max_rating != null && ratingValue > category.max_rating) {
          throw createError({
            statusCode: 400,
            statusMessage: `Your rating is above this category's maximum (${category.max_rating}).`
          })
        }
      }
    }

    const registration = await service.register(
      profile.id,
      tournamentId,
      body?.partner_player_id ?? null,
      categoryId
    )
    return registration
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
