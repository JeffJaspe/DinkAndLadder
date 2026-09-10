import { serverSupabaseClient } from '#supabase/server'
import { createActivityRepository } from '~/server/domains/activity/repositories/activity.repository'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createActivityService } from '~/server/domains/activity/services/activity.service'
import { attachLinkedEvents } from '~/server/domains/activity/services/linked-event'
import {
  FeedQueryValidationError,
  parsePagination
} from '~/server/domains/activity/dto/activity.dto'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw apiError(400, 'INVALID_QUERY', 'playerId is required.', { field: 'playerId' })
  }

  // Same validation the feed does: a negative offset became a negative SQL
  // OFFSET and a 500, and "20abc" was silently read as 20.
  let limit: number
  let offset: number
  try {
    ;({ limit, offset } = parsePagination(getQuery(event)))
  } catch (err) {
    if (err instanceof FeedQueryValidationError) {
      throw apiError(400, 'INVALID_QUERY', err.message, { field: err.field })
    }
    throw err
  }

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
