import { serverSupabaseClient } from '#supabase/server'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import {
  createRelationshipService,
  RelationshipServiceError
} from '~/server/domains/social/services/relationship.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }

  const targetPlayerId = getRouterParam(event, 'playerId')
  if (!targetPlayerId) {
    throw apiError(400, 'MISSING_PARAMETER', 'playerId is required.')
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')
  }

  const relationshipRepo = createRelationshipRepository(client)
  const service = createRelationshipService(relationshipRepo)

  try {
    await service.unfollow(profile.id, targetPlayerId)
    return { success: true }
  } catch (err) {
    if (err instanceof RelationshipServiceError) {
      throw apiError(err.status, err.code, err.message)
    }
    /**
     * Anything else is a database error, and for this endpoint it was always
     * the same one: `player_relationships` had RLS enabled with a SELECT
     * policy and no INSERT or DELETE, so every follow and unfollow was refused
     * with 42501 and surfaced as a bare 500 with no message. 066 adds the
     * missing policies; this log is so the next such failure names itself
     * instead of being invisible for another release.
     */
    console.error('[DELETE /api/v1/players/:playerId/follow] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not update the follow.')
  }
})
