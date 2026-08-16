import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityRecord, CreateActivityInput, ActivityType } from '../dto/activity.dto'

const ACTIVITY_COLUMNS =
  'id, actor_player_id, actor_club_id, activity_type, reference_type, reference_id, visibility, metadata, created_at'

export interface ActivityRepository {
  findById(activityId: string): Promise<ActivityRecord | null>
  findByActorPlayer(playerId: string, limit: number, offset: number): Promise<ActivityRecord[]>
  findPublicFeed(limit: number, offset: number, types?: ActivityType[], since?: string): Promise<ActivityRecord[]>
  findFollowingFeed(
    followingPlayerIds: string[],
    clubIds: string[],
    limit: number,
    offset: number,
    types?: ActivityType[],
    since?: string
  ): Promise<ActivityRecord[]>
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
      let query = client
        .from('activities')
        .select(ACTIVITY_COLUMNS)
        .eq('visibility', 'public')

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
      let query = client
        .from('activities')
        .select(ACTIVITY_COLUMNS)

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
