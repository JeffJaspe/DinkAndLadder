import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import { createTournamentRepository } from '~/server/domains/event/repositories/tournament.repository'
import { createTournamentCategoryRepository } from '~/server/domains/event/repositories/tournament-category.repository'
import { createTournamentCategoryService } from '~/server/domains/event/services/tournament-category.service'
import { EventServiceError } from '~/server/domains/event/services/event.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import type { TournamentFormat } from '~/server/domains/event/dto/tournament.dto'
import { getOptionalUser } from '~/server/utils/optional-user'

interface CreateCategoryBody {
  template_id?: string
  name?: string
  min_rating?: number | null
  max_rating?: number | null
  max_participants?: number | null
  match_type?: 'singles' | 'doubles' | null
  format?: TournamentFormat | null
  display_order?: number
}

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

  const body = await readBody<CreateCategoryBody>(event)

  const serviceClient = serverSupabaseServiceRole(event)
  const service = createTournamentCategoryService(
    createTournamentCategoryRepository(serviceClient),
    createTournamentRepository(serviceClient),
    createEventRepository(serviceClient)
  )

  try {
    if (body?.template_id) {
      const category = await service.createFromTemplate(profile.id, tournamentId, {
        template_id: body.template_id,
        max_participants: body.max_participants,
        display_order: body.display_order,
        match_type: body.match_type,
        format: body.format
      })
      return category
    }

    if (!body?.name) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Provide either template_id or a custom name.'
      })
    }

    const category = await service.createCustom(profile.id, tournamentId, {
      name: body.name,
      min_rating: body.min_rating,
      max_rating: body.max_rating,
      max_participants: body.max_participants,
      display_order: body.display_order,
      match_type: body.match_type
    })
    return category
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
