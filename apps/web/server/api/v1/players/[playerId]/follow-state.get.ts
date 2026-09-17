import { serverSupabaseServiceRole } from '#supabase/server'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createRelationshipService } from '~/server/domains/social/services/relationship.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

/**
 * Both directions of the follow between the reader and this player.
 *
 * One call rather than two, because the button needs both to know what to say:
 * "Follow back" is only honest when they already follow you, and mutual is what
 * lets either of you enter the other into an open-play session (066).
 *
 * A signed-out reader gets false/false rather than a 401 — the profile is
 * public and the control simply is not offered.
 */
export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) throw apiError(400, 'MISSING_PARAMETER', 'playerId is required.')

  const claims = await getOptionalUser(event)
  if (!claims) return { data: { following: false, follows_you: false } }

  const client = serverSupabaseServiceRole(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile || profile.id === playerId) {
    return { data: { following: false, follows_you: false } }
  }

  const service = createRelationshipService(createRelationshipRepository(client))

  const [following, follows_you] = await Promise.all([
    service.isFollowing(profile.id, playerId),
    service.isFollowing(playerId, profile.id)
  ])

  return { data: { following, follows_you } }
})
