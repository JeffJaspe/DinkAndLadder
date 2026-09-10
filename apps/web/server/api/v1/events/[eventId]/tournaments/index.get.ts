import { serverSupabaseClient } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createEventService } from '~/server/domains/event/services/event.service'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'MISSING_PARAMETER', 'eventId is required.')
  }

  const client = await serverSupabaseClient(event)
  const eventRepo = createEventRepository(client)
  const tournamentRepo = createTournamentRepository(client)
  const registrationRepo = createTournamentRegistrationRepository(client)
  const service = createEventService(eventRepo, tournamentRepo, registrationRepo)

  const tournaments = await service.getTournaments(eventId)
  return { tournaments }
})
