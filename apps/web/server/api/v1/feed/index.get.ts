import type { SupabaseClient } from '@supabase/supabase-js'
import {
  attachLinkedEvents,
  type LinkedEvent
} from '~/server/domains/activity/services/linked-event'
import { serverSupabaseClient } from '#supabase/server'
import { createActivityRepository } from '~/server/domains/activity/repositories/activity.repository'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createActivityService } from '~/server/domains/activity/services/activity.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import type { ActivityDto, FeedQuery } from '~/server/domains/activity/dto/activity.dto'
import {
  FeedQueryValidationError,
  parseFeedQuery
} from '~/server/domains/activity/dto/activity.dto'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

interface EnrichedActivity extends ActivityDto {
  actor_display_name: string
  /** The club a club-authored row belongs to, so the page can name it. */
  actor_club_name?: string | null
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
  const clubIds = [
    ...new Set(activities.map((a) => a.actor_club_id).filter((id): id is string => !!id))
  ]

  // Two lookups, side by side: the person and, for a club-authored row, the
  // club. "Owner created an event" named the person and not the club it was
  // for, which on a feed of several clubs left the reader guessing whose
  // evening it was.
  const [profiles, clubs] = await Promise.all([
    playerIds.length
      ? client.from('player_profiles').select('id, display_name').in('id', playerIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    clubIds.length
      ? client.from('clubs').select('id, name').in('id', clubIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] })
  ])

  const nameMap = new Map((profiles.data ?? []).map((p) => [p.id, p.display_name]))
  const clubMap = new Map((clubs.data ?? []).map((c) => [c.id, c.name]))

  return activities.map((a) => ({
    ...a,
    actor_display_name: (a.actor_player_id && nameMap.get(a.actor_player_id)) || 'Unknown',
    actor_club_name: (a.actor_club_id && clubMap.get(a.actor_club_id)) || null
  }))
}

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)

  let query: FeedQuery
  try {
    query = {
      ...parseFeedQuery(getQuery(event)),
      // Not client-selectable. The scope is a product rule, not a preference,
      // and accepting `?scope=geo` from the browser would hand any caller the
      // whole public firehose the community scope exists to replace.
      scope: 'community'
    }
  } catch (err) {
    // A bad query string is the caller's mistake, and it has to be answered
    // before the try/catch further down turns everything into a 500 — an
    // unparseable `since` reached Postgres and came back as exactly that.
    if (err instanceof FeedQueryValidationError) {
      throw apiError(400, 'INVALID_QUERY', err.message, { field: err.field })
    }
    throw err
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
