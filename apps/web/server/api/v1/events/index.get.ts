import { serverSupabaseClient } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createEventService } from '~/server/domains/event/services/event.service'
import type { EventSearchQuery } from '~/server/domains/event/dto/event.dto'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const searchQuery: EventSearchQuery = {
    club_id: query.club_id as string | undefined,
    province: query.province as string | undefined,
    city: query.city as string | undefined,
    status: query.status as EventSearchQuery['status'] | undefined,
    limit: Math.min(parseInt(query.limit as string) || 20, 100),
    offset: parseInt(query.offset as string) || 0
  }

  const client = await serverSupabaseClient(event)
  const eventRepo = createEventRepository(client)
  const tournamentRepo = createTournamentRepository(client)
  const registrationRepo = createTournamentRegistrationRepository(client)
  const service = createEventService(eventRepo, tournamentRepo, registrationRepo)

  const events = await service.searchEvents(searchQuery)
  return { events }
})
