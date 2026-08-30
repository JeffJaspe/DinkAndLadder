import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createEventService } from '~/server/domains/event/services/event.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { resolveFeeWaiver } from '~/server/domains/event/services/registration-fee'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw createError({ statusCode: 400, statusMessage: 'eventId is required.' })
  }

  const client = await serverSupabaseClient(event)
  const eventRepo = createEventRepository(client)
  const tournamentRepo = createTournamentRepository(client)
  const registrationRepo = createTournamentRegistrationRepository(client)
  const service = createEventService(eventRepo, tournamentRepo, registrationRepo)

  const eventDto = await service.getEvent(eventId)
  if (!eventDto) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found.' })
  }

  // Whether THIS caller pays. Computed here rather than in the browser: a
  // price the client works out for itself is a suggestion, not a price. Null
  // caller (signed out) gets the ordinary quote.
  const claims = await serverSupabaseUser(event).catch(() => null)
  let playerId: string | null = null
  if (claims) {
    const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
    playerId = profile?.id ?? null
  }

  const feeWaiver = await resolveFeeWaiver(serverSupabaseServiceRole(event), eventId, playerId)

  return { ...eventDto, fee_waiver: feeWaiver }
})
