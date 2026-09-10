import { serverSupabaseClient } from '#supabase/server'
import { createTournamentRepository } from '~/server/domains/event/repositories/tournament.repository'
import { toTournamentDto } from '~/server/domains/event/dto/tournament.dto'
import { apiError } from '~/server/utils/api-error'

/**
 * No auth required — same visibility posture as the bracket/registrations endpoints for
 * this tournament. Plugs a real gap: nothing previously exposed a plain tournament
 * getter (only list-by-event and update existed), so the tournament detail page had no
 * way to load the tournament's own name/match_type/rating range at all.
 */
export default defineEventHandler(async (event) => {
  const tournamentId = getRouterParam(event, 'tournamentId')
  if (!tournamentId) {
    throw apiError(400, 'MISSING_PARAMETER', 'tournamentId is required.')
  }

  const client = await serverSupabaseClient(event)
  const tournament = await createTournamentRepository(client).findById(tournamentId)
  if (!tournament) {
    throw apiError(404, 'NOT_FOUND', 'Tournament not found.')
  }

  return toTournamentDto(tournament)
})
