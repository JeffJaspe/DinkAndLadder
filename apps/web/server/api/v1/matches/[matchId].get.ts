import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import { createMatchService } from '~/server/domains/match/services/match.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
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

  /**
   * Participants and verifiers are stored as ids, so the detail screen could
   * only show "Player 3f2a91c4" — including in the verification timeline,
   * where the whole point is being able to see who did what.
   *
   * Resolved here rather than through an embed because match_verifications has
   * no foreign key to player_profiles that PostgREST can traverse. One bulk
   * lookup covers both lists.
   */
  const playerIds = [
    ...new Set([
      ...match.participants.map((p) => p.player_id),
      ...match.verifications.map((v) => v.verifier_player_id),
      match.submitted_by_player_id
    ])
  ].filter(Boolean) as string[]

  const profiles = await createPlayerProfileRepository(client).findByIds(playerIds)

  return {
    ...match,
    // id -> display name, for every player this match references.
    players: Object.fromEntries(profiles.map((p) => [p.id, p.display_name]))
  }
})
