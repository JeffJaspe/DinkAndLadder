import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createEventService, EventServiceError } from '~/server/domains/event/services/event.service'
import type { CreateEventInput } from '~/server/domains/event/dto/event.dto'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.id)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const input = await readBody<CreateEventInput>(event)
  if (!input.club_id || !input.name || !input.start_date || !input.end_date) {
    throw createError({
      statusCode: 400,
      statusMessage: 'club_id, name, start_date, and end_date are required.'
    })
  }

  const eventRepo = createEventRepository(client)
  const tournamentRepo = createTournamentRepository(client)
  const registrationRepo = createTournamentRegistrationRepository(client)
  const membershipRepo = createClubMembershipRepository(client)
  const service = createEventService(eventRepo, tournamentRepo, registrationRepo, membershipRepo)

  try {
    const createdEvent = await service.createEvent(profile.id, input)
    return createdEvent
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
