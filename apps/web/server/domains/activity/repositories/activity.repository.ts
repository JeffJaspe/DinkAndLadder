import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ActivityRecord,
  CreateActivityInput,
  ActivityType,
  FeedScope
} from '../dto/activity.dto'

const ACTIVITY_COLUMNS =
  'id, actor_player_id, actor_club_id, activity_type, reference_type, reference_id, visibility, metadata, created_at'

/**
 * Say "the migration has not been applied" when that is what happened.
 *
 * PostgREST answers a call to a function it cannot find with PGRST202 and a
 * message about its schema cache, which reaches the page as a generic 500 and
 * an unhelpful "something went wrong fetching activity". The repo has been here
 * before — 028-event-time deployed ahead of its migration and every event screen
 * failed on a raw `42703` — so the error now names the function and the fix.
 *
 * Deliberately not a fallback to the old signature: silently serving the
 * unscoped public feed would hide a missing migration behind exactly the
 * behaviour 049 exists to remove.
 */
function asMigrationHint(error: { code?: string; message?: string }, fn: string): Error {
  if (error.code !== 'PGRST202') return error as Error
  return new Error(
    `${fn} is missing or has an older signature. Apply the Liquibase changelog ` +
      `(049-feed-community-scope) to this database before running this code — ` +
      `see database/liquibase/README.md. Original: ${error.message ?? 'PGRST202'}`
  )
}

export interface ActivityRepository {
  findById(activityId: string): Promise<ActivityRecord | null>
  findByActorPlayer(playerId: string, limit: number, offset: number): Promise<ActivityRecord[]>
  findPublicFeed(
    limit: number,
    offset: number,
    types?: ActivityType[],
    since?: string
  ): Promise<ActivityRecord[]>
  findFollowingFeed(
    followingPlayerIds: string[],
    clubIds: string[],
    limit: number,
    offset: number,
    types?: ActivityType[],
    since?: string
  ): Promise<ActivityRecord[]>
  /**
   * The feed, ordered by how close the actor is to the viewer (barangay, then
   * city, then province) and newest first inside each band.
   *
   * `scope` decides who is in it. `community` (049-feed-community-scope,
   * narrowed by 050, and the default) restricts it to the viewer's own people -
   * duo partners, team-ups, and anyone they have played a verified match with -
   * plus activity authored by their own clubs. That is exactly what the
   * /community page lists. It is what the feed sends. `geo` is 039's
   * everyone's-public-activity behaviour, kept for callers that want the whole
   * listing; a signed-out viewer only ever gets that one, with every geo score
   * at 0, i.e. plain newest-first.
   *
   * Goes through the fn_feed_for_player function rather than the query builder,
   * because both the filter and the ordering depend on columns from joined
   * tables and have to be applied before LIMIT/OFFSET. Doing it in application
   * code, as ActivityService.reprioritize() did, can only ever reorder the page
   * it already fetched.
   */
  findGeoFeed(
    viewerPlayerId: string | null,
    limit: number,
    offset: number,
    types?: ActivityType[],
    since?: string,
    scope?: FeedScope
  ): Promise<ActivityRecord[]>
  /**
   * How many players are in this viewer's community, self included.
   *
   * The feed needs this to tell "your people have been quiet" apart from "you
   * have no people yet" - two empty pages that deserve different words.
   */
  countCommunity(viewerPlayerId: string): Promise<number>
  create(input: CreateActivityInput): Promise<ActivityRecord>
}

export function createActivityRepository(client: SupabaseClient): ActivityRepository {
  return {
    async findById(activityId) {
      const { data, error } = await client
        .from('activities')
        .select(ACTIVITY_COLUMNS)
        .eq('id', activityId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ActivityRecord | null
    },

    async findByActorPlayer(playerId, limit, offset) {
      const { data, error } = await client
        .from('activities')
        .select(ACTIVITY_COLUMNS)
        .eq('actor_player_id', playerId)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error
      return (data ?? []) as unknown as ActivityRecord[]
    },

    async findPublicFeed(limit, offset, types, since) {
      let query = client.from('activities').select(ACTIVITY_COLUMNS).eq('visibility', 'public')

      if (types && types.length > 0) {
        query = query.in('activity_type', types)
      }
      if (since) {
        query = query.gt('created_at', since)
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error
      return (data ?? []) as unknown as ActivityRecord[]
    },

    async findFollowingFeed(followingPlayerIds, clubIds, limit, offset, types, since) {
      let query = client.from('activities').select(ACTIVITY_COLUMNS)

      const conditions: string[] = []

      if (followingPlayerIds.length > 0) {
        conditions.push(`actor_player_id.in.(${followingPlayerIds.join(',')})`)
      }
      if (clubIds.length > 0) {
        conditions.push(`actor_club_id.in.(${clubIds.join(',')})`)
      }

      if (conditions.length === 0) {
        return []
      }

      query = query.or(conditions.join(','))
      query = query.in('visibility', ['public', 'followers'])

      if (types && types.length > 0) {
        query = query.in('activity_type', types)
      }
      if (since) {
        query = query.gt('created_at', since)
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error
      return (data ?? []) as unknown as ActivityRecord[]
    },

    async findGeoFeed(viewerPlayerId, limit, offset, types, since, scope = 'community') {
      const { data, error } = await client.rpc('fn_feed_for_player', {
        p_player_id: viewerPlayerId,
        p_limit: limit,
        p_offset: offset,
        p_types: types && types.length > 0 ? types : null,
        p_since: since ?? null,
        // A signed-out visitor has no community to scope to, so asking for one
        // would return an empty page rather than a public listing.
        p_scope: viewerPlayerId ? scope : 'geo'
      })

      if (error) throw asMigrationHint(error, 'fn_feed_for_player')
      return (data ?? []) as unknown as ActivityRecord[]
    },

    async countCommunity(viewerPlayerId) {
      const { data, error } = await client.rpc('fn_community_player_ids', {
        p_player_id: viewerPlayerId
      })

      if (error) throw asMigrationHint(error, 'fn_community_player_ids')
      return ((data ?? []) as unknown[]).length
    },

    async create(input) {
      const { data, error } = await client
        .from('activities')
        .insert({
          actor_player_id: input.actor_player_id ?? null,
          actor_club_id: input.actor_club_id ?? null,
          activity_type: input.activity_type,
          reference_type: input.reference_type ?? null,
          reference_id: input.reference_id ?? null,
          visibility: input.visibility ?? 'public',
          metadata: input.metadata ?? null
        })
        .select(ACTIVITY_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as ActivityRecord
    }
  }
}
