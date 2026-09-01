import { serverSupabaseClient } from '#supabase/server'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createRelationshipService } from '~/server/domains/social/services/relationship.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const limit = Math.min(parseInt(query.limit as string) || 20, 100)
  const offset = parseInt(query.offset as string) || 0

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const relationshipRepo = createRelationshipRepository(client)
  const service = createRelationshipService(relationshipRepo)

  const following = await service.getFollowing(profile.id, limit, offset)
  return { following }
})
