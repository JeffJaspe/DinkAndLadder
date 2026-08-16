import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createEventService, EventServiceError } from '~/server/domains/event/services/event.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'

interface UpdateRegistrationStatusInput {
  status: 'confirmed' | 'rejected' | 'waitlisted'
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const registrationId = getRouterParam(event, 'registrationId')
  if (!registrationId) {
    throw createError({ statusCode: 400, statusMessage: 'registrationId is required.' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.id)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const body = await readBody<UpdateRegistrationStatusInput>(event)
  if (!body.status || !['confirmed', 'rejected', 'waitlisted'].includes(body.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'status must be one of: confirmed, rejected, waitlisted'
    })
  }

  const eventRepo = createEventRepository(client)
  const tournamentRepo = createTournamentRepository(client)
  const registrationRepo = createTournamentRegistrationRepository(client)
  const service = createEventService(eventRepo, tournamentRepo, registrationRepo)

  try {
    const registration = await service.updateRegistrationStatus(profile.id, registrationId, body.status)
    return registration
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
