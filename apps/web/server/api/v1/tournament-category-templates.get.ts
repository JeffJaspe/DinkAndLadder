import { serverSupabaseClient } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import { createTournamentRepository } from '~/server/domains/event/repositories/tournament.repository'
import { createTournamentCategoryRepository } from '~/server/domains/event/repositories/tournament-category.repository'
import { createTournamentCategoryService } from '~/server/domains/event/services/tournament-category.service'

/** Public reference data — the predefined Novice→Pro rating-band presets. */
export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient(event)
  const service = createTournamentCategoryService(
    createTournamentCategoryRepository(client),
    createTournamentRepository(client),
    createEventRepository(client)
  )

  const templates = await service.listTemplates()
  return { data: templates, request_id: crypto.randomUUID() }
})
