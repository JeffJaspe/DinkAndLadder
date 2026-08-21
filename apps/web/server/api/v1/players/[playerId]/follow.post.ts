import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createRelationshipService, RelationshipServiceError } from '~/server/domains/social/services/relationship.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createActivityRepository } from '~/server/domains/activity/repositories/activity.repository'
import { createActivityLogger } from '~/server/domains/activity/services/activity.service'

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
    const relationship = await service.follow(profile.id, targetPlayerId)

    // Log activity for feed (best-effort, uses service-role for insert)
    const serviceClient = serverSupabaseServiceRole(event)
    const activityLogger = createActivityLogger(createActivityRepository(serviceClient))
    await activityLogger.logStartedFollowing(profile.id, targetPlayerId)

    return relationship
  } catch (err) {
    if (err instanceof RelationshipServiceError) {
      throw createError({ statusCode: err.status, statusMessage: err.message })
    }
    throw err
  }
})
