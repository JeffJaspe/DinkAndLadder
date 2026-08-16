import { serverSupabaseClient } from '#supabase/server'
import { createActivityRepository } from '~/server/domains/activity/repositories/activity.repository'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createActivityService } from '~/server/domains/activity/services/activity.service'

export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw createError({ statusCode: 400, statusMessage: 'playerId is required.' })
  }

  const rawQuery = getQuery(event)
  const limit = Math.min(parseInt(rawQuery.limit as string) || 20, 50)
  const offset = parseInt(rawQuery.offset as string) || 0

  const client = await serverSupabaseClient(event)
  const activityRepo = createActivityRepository(client)
  const relationshipRepo = createRelationshipRepository(client)
  const service = createActivityService(activityRepo, relationshipRepo)

  const activities = await service.getPlayerActivities(playerId, limit, offset)
  return { activities }
})
