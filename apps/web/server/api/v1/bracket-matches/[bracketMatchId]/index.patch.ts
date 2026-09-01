import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createBracketRepository } from '~/server/domains/event/repositories/bracket.repository'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import {
  createTournamentRepository,
  createTournamentRegistrationRepository
} from '~/server/domains/event/repositories/tournament.repository'
import {
  createBracketService,
  BracketServiceError
} from '~/server/domains/event/services/bracket.service'
import type { UpdateBracketMatchInput } from '~/server/domains/event/dto/bracket.dto'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const bracketMatchId = getRouterParam(event, 'bracketMatchId')
  if (!bracketMatchId) {
    throw createError({ statusCode: 400, statusMessage: 'bracketMatchId is required.' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const input = await readBody<UpdateBracketMatchInput>(event)

  const serviceClient = serverSupabaseServiceRole(event)
  const bracketRepo = createBracketRepository(serviceClient)
  const tournamentRepo = createTournamentRepository(serviceClient)
  const registrationRepo = createTournamentRegistrationRepository(serviceClient)
  const eventRepo = createEventRepository(serviceClient)
  const service = createBracketService(bracketRepo, tournamentRepo, registrationRepo, eventRepo)

  try {
    const updated = await service.updateBracketMatch(profile.id, bracketMatchId, input)
    return updated
  } catch (err) {
    if (err instanceof BracketServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
