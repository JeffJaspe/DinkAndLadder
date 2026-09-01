import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
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
import { createPartnershipRepository } from '~/server/domains/partnership/repositories/partnership.repository'
import { getOptionalUser } from '~/server/utils/optional-user'

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

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const body = await readBody<RegisterForTournamentInput>(event)

  const serviceClient = serverSupabaseServiceRole(event)
  const categoryRepo = createTournamentCategoryRepository(serviceClient)

  // Every rule that decides whether this entry is allowed — the partner
  // requirement, the one-entry-per-category invariant, the rating band and the
  // capacity — lives in EventService. This handler only supplies the
  // repositories those rules need and translates the failure into a status
  // code. The band check in particular used to sit here, which put business
  // logic in the wiring layer and left it reading the tournament's match type
  // and the registrant's rating alone.
  const service = createEventService(
    createEventRepository(serviceClient),
    createTournamentRepository(serviceClient),
    createTournamentRegistrationRepository(serviceClient),
    undefined,
    undefined,
    categoryRepo,
    createPartnershipRepository(serviceClient),
    createRatingRepository(serviceClient)
  )

  const categoryId = body?.category_id ?? null

  // Ownership of the category is a routing question, not a business rule: a
  // category id belonging to a different tournament makes the URL wrong.
  if (categoryId) {
    const category = await categoryRepo.findById(categoryId)
    if (!category || category.tournament_id !== tournamentId) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Category not found for this tournament.'
      })
    }
  }

  try {
    return await service.register(
      profile.id,
      tournamentId,
      body?.partner_player_id ?? null,
      categoryId
    )
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
