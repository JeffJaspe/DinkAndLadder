import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
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

interface LinkedEvent {
  id: string
  name: string
  start_date: string | null
  city: string | null
  venue: string | null
}

interface EnrichedActivity extends ActivityDto {
  actor_display_name: string
  /** Present when a shout-out was posted against an event. */
  event?: LinkedEvent | null
}

/**
 * Resolve the events shout-outs point at, in one round trip for the whole page.
 *
 * The id rides in the activity metadata (see ActivityLogger.logShoutout), so
 * this is a lookup rather than a join - and an event that has since been
 * deleted simply resolves to nothing, leaving the message to stand on its own.
 */
async function attachLinkedEvents(
  client: SupabaseClient,
  activities: EnrichedActivity[]
): Promise<EnrichedActivity[]> {
  const eventIds = [
    ...new Set(
      activities
        .map((a) => (a.metadata as Record<string, unknown> | null)?.event_id)
        .filter((id): id is string => typeof id === 'string')
    )
  ]
  if (eventIds.length === 0) return activities

  const { data } = await client
    .from('events')
    .select('id, name, start_date, city, venue')
    .in('id', eventIds)

  const byId = new Map(((data ?? []) as LinkedEvent[]).map((e) => [e.id, e]))

  return activities.map((a) => {
    const id = (a.metadata as Record<string, unknown> | null)?.event_id
    return typeof id === 'string' ? { ...a, event: byId.get(id) ?? null } : a
  })
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
  const user = await serverSupabaseUser(event)

  const rawQuery = getQuery(event)
  const query: FeedQuery = {
    limit: Math.min(parseInt(rawQuery.limit as string) || 20, 50),
    offset: parseInt(rawQuery.offset as string) || 0,
    types: rawQuery.types ? ((rawQuery.types as string).split(',') as ActivityType[]) : undefined,
    since: rawQuery.since as string | undefined
  }

  const client = await serverSupabaseClient(event)
  const activityRepo = createActivityRepository(client)
  const relationshipRepo = createRelationshipRepository(client)
  const clubRepo = createClubRepository(client)
  const service = createActivityService(activityRepo, relationshipRepo, clubRepo)

  /**
   * One feed for everyone, ordered by proximity.
   *
   * This used to build a personalised feed from the follow graph plus a
   * "circle" of past opponents, which meant a new player with no follows saw
   * almost nothing - precisely the person who most needs to find a game. The
   * feed is now everyone's public activity, ordered nearest-first (barangay,
   * then city, then province) by fn_feed_for_player.
   *
   * A signed-out visitor passes a null player id and gets the same feed with
   * every geo score at 0, i.e. plain newest-first.
   */
  let viewerPlayerId: string | null = null
  if (user) {
    const playerRepo = createPlayerProfileRepository(client)
    const profile = await playerRepo.findByUserId(user.sub)
    viewerPlayerId = profile?.id ?? null
  }

  const activities = await service.getGeoFeed(viewerPlayerId, query)
  const enriched = await attachLinkedEvents(
    client,
    await enrichWithDisplayNames(client, activities)
  )
  return { activities: enriched }
})
