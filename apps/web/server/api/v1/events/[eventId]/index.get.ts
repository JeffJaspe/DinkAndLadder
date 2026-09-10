import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createEventService } from '~/server/domains/event/services/event.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { resolveFeeWaiver } from '~/server/domains/event/services/registration-fee'
import { getOptionalUser } from '~/server/utils/optional-user'
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

  const eventDto = await service.getEvent(eventId)
  if (!eventDto) {
    throw apiError(404, 'NOT_FOUND', 'Event not found.')
  }

  // Whether THIS caller pays. Computed here rather than in the browser: a
  // price the client works out for itself is a suggestion, not a price. Null
  // caller (signed out) gets the ordinary quote.
  const claims = await getOptionalUser(event)
  let playerId: string | null = null
  if (claims) {
    const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
    playerId = profile?.id ?? null
  }

  const feeWaiver = await resolveFeeWaiver(serverSupabaseServiceRole(event), eventId, playerId)

  return { ...eventDto, fee_waiver: feeWaiver }
})
