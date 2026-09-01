import type { SupabaseClient } from '@supabase/supabase-js'
import { attachLinkedEvents, type LinkedEvent } from '~/server/domains/activity/services/linked-event'
import { serverSupabaseClient } from '#supabase/server'
import { createActivityRepository } from '~/server/domains/activity/repositories/activity.repository'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createActivityService } from '~/server/domains/activity/services/activity.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import type {
  ActivityDto,
  ActivityType,
  FeedQuery
} from '~/server/domains/activity/dto/activity.dto'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

interface EnrichedActivity extends ActivityDto {
  actor_display_name: string
  /** Present when a shout-out was posted against an event. */
  event?: LinkedEvent | null
}

async function enrichWithDisplayNames(
  client: SupabaseClient,
  activities: ActivityDto[]
): Promise<EnrichedActivity[]> {
  const playerIds = [
    ...new Set(activities.map((a) => a.actor_player_id).filter((id): id is string => !!id))
  ]
  if (playerIds.length === 0) {
    return activities.map((a) => ({ ...a, actor_display_name: 'Unknown' }))
  }

  const { data: profiles } = await client
    .from('player_profiles')
    .select('id, display_name')
    .in('id', playerIds)

  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]))

  return activities.map((a) => ({
    ...a,
    actor_display_name: (a.actor_player_id && nameMap.get(a.actor_player_id)) || 'Unknown'
  }))
}

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)

  const rawQuery = getQuery(event)
  const query: FeedQuery = {
    limit: Math.min(parseInt(rawQuery.limit as string) || 20, 50),
    offset: parseInt(rawQuery.offset as string) || 0,
    types: rawQuery.types ? ((rawQuery.types as string).split(',') as ActivityType[]) : undefined,
    since: rawQuery.since as string | undefined,
    // Not client-selectable. The scope is a product rule, not a preference, and
    // accepting `?scope=geo` from the browser would hand any caller the whole
    // public firehose the community scope exists to replace.
    scope: 'community'
  }

  const client = await serverSupabaseClient(event)
  const activityRepo = createActivityRepository(client)
  const relationshipRepo = createRelationshipRepository(client)
  const clubRepo = createClubRepository(client)
  const service = createActivityService(activityRepo, relationshipRepo, clubRepo)

  /**
   * The viewer's community, ordered by proximity.
   *
   * This was briefly everyone's public activity, on the reasoning that a new
   * player with no follows would otherwise see nothing. That traded one empty
   * feed for a louder problem: a feed of strangers. fn_feed_for_player now
   * filters to the people this player actually plays with, and keeps the
   * nearest-first ordering (barangay, then city, then province) within it.
   *
   * A signed-out visitor passes a null player id, has no community to scope to,
   * and gets the public listing with every geo score at 0 - plain newest-first.
   */
  let viewerPlayerId: string | null = null
  if (user) {
    const playerRepo = createPlayerProfileRepository(client)
    const profile = await playerRepo.findByUserId(user.sub)
    viewerPlayerId = profile?.id ?? null
  }

  try {
    const feed = await service.getGeoFeed(viewerPlayerId, query)
    const enriched = await attachLinkedEvents(
      client,
      await enrichWithDisplayNames(client, feed.activities)
    )
    return { activities: enriched, community_size: feed.community_size }
  } catch (err) {
    // Logged rather than swallowed: the page only ever shows "could not load the
    // feed", so without this the actual cause never reaches anyone. The
    // repository turns a missing migration into a message that says so.
    console.error('[GET /api/v1/feed] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load the feed.')
  }
})
