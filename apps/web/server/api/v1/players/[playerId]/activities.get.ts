import { serverSupabaseClient } from '#supabase/server'
import { createActivityRepository } from '~/server/domains/activity/repositories/activity.repository'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createActivityService } from '~/server/domains/activity/services/activity.service'
import { attachLinkedEvents } from '~/server/domains/activity/services/linked-event'

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

  // Same enrichment the feed does. Without it a shout-out on a profile carried
  // the event id in its metadata and nothing else, so the profile could not
  // render the link the feed already showed.
  const enriched = await attachLinkedEvents(client, activities)

  return { activities: enriched }
})
