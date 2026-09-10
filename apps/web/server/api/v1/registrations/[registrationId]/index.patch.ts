import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
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
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

interface UpdateRegistrationStatusInput {
  status: 'confirmed' | 'rejected' | 'waitlisted'
}

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const registrationId = getRouterParam(event, 'registrationId')
  if (!registrationId) {
    throw apiError(400, 'MISSING_PARAMETER', 'registrationId is required.')
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const body = await readBody<UpdateRegistrationStatusInput>(event)
  if (!body.status || !['confirmed', 'rejected', 'waitlisted'].includes(body.status)) {
    throw apiError(400, 'INVALID_INPUT', 'status must be one of: confirmed, rejected, waitlisted.')
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
      throw apiError(err.status, err.code, err.message)
    }
    throw err
  }
})
