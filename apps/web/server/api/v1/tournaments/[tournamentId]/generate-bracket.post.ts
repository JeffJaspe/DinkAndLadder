import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createBracketRepository } from '~/server/domains/event/repositories/bracket.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createBracketService, BracketServiceError } from '~/server/domains/event/services/bracket.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const tournamentId = getRouterParam(event, 'tournamentId')
  if (!tournamentId) {
    throw createError({ statusCode: 400, statusMessage: 'tournamentId is required.' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const bracketRepo = createBracketRepository(serviceClient)
  const tournamentRepo = createTournamentRepository(serviceClient)
  const registrationRepo = createTournamentRegistrationRepository(serviceClient)
  const eventRepo = createEventRepository(serviceClient)
  const service = createBracketService(bracketRepo, tournamentRepo, registrationRepo, eventRepo)

  try {
    const bracket = await service.generateBracket(profile.id, tournamentId)
    return bracket
  } catch (err) {
    if (err instanceof BracketServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
