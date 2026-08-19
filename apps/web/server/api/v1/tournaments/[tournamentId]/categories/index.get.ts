import { serverSupabaseClient } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import { createTournamentRepository } from '~/server/domains/event/repositories/tournament.repository'
import { createTournamentCategoryRepository } from '~/server/domains/event/repositories/tournament-category.repository'
import { createTournamentCategoryService } from '~/server/domains/event/services/tournament-category.service'

/**
 * No auth required — categories inherit the tournament/event's own visibility (RLS on
 * tournament_categories mirrors tournaments_select_visible, see 018-platform-enhancements).
 */
export default defineEventHandler(async (event) => {
  const tournamentId = getRouterParam(event, 'tournamentId')
  if (!tournamentId) {
    throw createError({ statusCode: 400, statusMessage: 'tournamentId is required.' })
  }

  const client = await serverSupabaseClient(event)
  const service = createTournamentCategoryService(
    createTournamentCategoryRepository(client),
    createTournamentRepository(client),
    createEventRepository(client)
  )

  const categories = await service.listForTournament(tournamentId)
  return { data: categories, request_id: crypto.randomUUID() }
})
