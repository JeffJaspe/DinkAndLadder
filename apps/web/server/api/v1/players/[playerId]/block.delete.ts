import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createRelationshipService, RelationshipServiceError } from '~/server/domains/social/services/relationship.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const targetPlayerId = getRouterParam(event, 'playerId')
  if (!targetPlayerId) {
    throw createError({ statusCode: 400, statusMessage: 'playerId is required.' })
  }

  const client = await serverSupabaseClient(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)
  if (!profile) {
    throw createError({ statusCode: 403, statusMessage: 'Player profile required.' })
  }

  const relationshipRepo = createRelationshipRepository(client)
  const service = createRelationshipService(relationshipRepo)

  try {
    await service.unblock(profile.id, targetPlayerId)
    return { success: true }
  } catch (err) {
    if (err instanceof RelationshipServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
