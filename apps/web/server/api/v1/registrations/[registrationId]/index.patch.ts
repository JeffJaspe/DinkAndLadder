import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import {
  createEventService,
  EventServiceError
} from '~/server/domains/event/services/event.service'
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
  const profile = await playerRepo.findByUserId(user.sub)
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

  const serviceClient = serverSupabaseServiceRole(event)
  const eventRepo = createEventRepository(serviceClient)
  const tournamentRepo = createTournamentRepository(serviceClient)
  const registrationRepo = createTournamentRegistrationRepository(serviceClient)
  // The membership repo is what lets the hosting club's staff — not only the
  // event creator — review registrations. Without it the service silently
  // degrades to organizer-only, which is what it used to do.
  const membershipRepo = createClubMembershipRepository(serviceClient)
  const service = createEventService(eventRepo, tournamentRepo, registrationRepo, membershipRepo)

  try {
    const registration = await service.updateRegistrationStatus(
      profile.id,
      registrationId,
      body.status
    )
    return registration
  } catch (err) {
    if (err instanceof EventServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
