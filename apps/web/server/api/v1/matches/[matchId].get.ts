import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import { createMatchService } from '~/server/domains/match/services/match.service'
import { apiError } from '~/server/utils/api-error'

/**
 * User-scoped client: visibility is enforced entirely by the matches/match_participants/
 * match_scores RLS policies (fn_is_match_participant) — no unverified caller can list
 * matches they didn't play in, and there's no public "spectator" view in this pass.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view this match.')
  }

  const matchId = getRouterParam(event, 'matchId')
  if (!matchId) {
    throw apiError(400, 'VALIDATION_ERROR', 'matchId is required.')
  }

  const client = await serverSupabaseClient(event)
  const service = createMatchService(createMatchRepository(client))
  const match = await service.getById(matchId)

  if (!match) {
    throw apiError(404, 'NOT_FOUND', 'No match found with that id.')
  }

  return match
})
