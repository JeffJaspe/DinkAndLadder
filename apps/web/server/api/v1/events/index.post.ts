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
import type { CreateEventInput } from '~/server/domains/event/dto/event.dto'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const input = await readBody<CreateEventInput>(event)
  if (!input.club_id || !input.name || !input.start_date || !input.end_date || !input.event_type) {
    throw createError({
      statusCode: 400,
      statusMessage: 'club_id, name, start_date, end_date, and event_type are required.'
    })
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const eventRepo = createEventRepository(serviceClient)
  const tournamentRepo = createTournamentRepository(serviceClient)
  const registrationRepo = createTournamentRegistrationRepository(serviceClient)
  const membershipRepo = createClubMembershipRepository(client)
  // The club repository is what lets the service read verification status and
  // apply the draft allowance an unverified club is held to.
  const service = createEventService(
    eventRepo,
    tournamentRepo,
    registrationRepo,
    membershipRepo,
    undefined,
    undefined,
    undefined,
    undefined,
    createClubRepository(serviceClient)
  )

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
