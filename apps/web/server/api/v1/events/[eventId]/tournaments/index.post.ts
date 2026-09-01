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
import type { CreateTournamentInput } from '~/server/domains/event/dto/tournament.dto'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'eventId is required.' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const body = await readBody<Omit<CreateTournamentInput, 'event_id'> & { auto_join?: boolean }>(
    event
  )
  if (!body.name || !body.match_type) {
    throw createError({
      statusCode: 400,
      statusMessage: 'name and match_type are required.'
    })
  }

  const { auto_join, ...tournamentData } = body
  const input: CreateTournamentInput = {
    ...tournamentData,
    event_id: eventId
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const eventRepo = createEventRepository(serviceClient)
  const tournamentRepo = createTournamentRepository(serviceClient)
  const registrationRepo = createTournamentRegistrationRepository(serviceClient)
  const service = createEventService(eventRepo, tournamentRepo, registrationRepo)

  try {
    const tournament = await service.createTournament(profile.id, input)

    if (auto_join) {
      const registration = await registrationRepo.create(tournament.id, profile.id, null, null)
      await registrationRepo.updateStatus(registration.id, 'confirmed')
    }

    return tournament
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
