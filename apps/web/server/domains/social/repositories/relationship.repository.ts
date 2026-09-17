import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RelationshipRecord,
  RelationshipType,
  RelationshipStatus
} from '../dto/relationship.dto'

const RELATIONSHIP_COLUMNS =
  'id, from_player_id, to_player_id, relationship_type, status, created_at, updated_at'

export interface RelationshipRepository {
  findByFromAndTo(
    fromPlayerId: string,
    toPlayerId: string,
    type: RelationshipType
  ): Promise<RelationshipRecord | null>
  findFollowing(playerId: string, limit: number, offset: number): Promise<RelationshipRecord[]>
  findFollowers(playerId: string, limit: number, offset: number): Promise<RelationshipRecord[]>
  findBlocked(playerId: string): Promise<RelationshipRecord[]>
  create(
    fromPlayerId: string,
    toPlayerId: string,
    type: RelationshipType,
    status: RelationshipStatus
  ): Promise<RelationshipRecord>
  updateStatus(id: string, status: RelationshipStatus): Promise<RelationshipRecord>
  delete(id: string): Promise<void>
  isBlocked(fromPlayerId: string, toPlayerId: string): Promise<boolean>
  countFollowers(playerId: string): Promise<number>
  countFollowing(playerId: string): Promise<number>
  /**
   * Which of `otherPlayerIds` follow `playerId` back AND are followed by them.
   *
   * Bulk, because its one caller asks about a whole group at once — registering
   * four people into a session should be one round trip, not four.
   */
  findMutualFollows(playerId: string, otherPlayerIds: string[]): Promise<string[]>
  /** Everyone this player mutually follows. The unbounded form of the above. */
  findAllMutualFollows(playerId: string): Promise<string[]>
}

export function createRelationshipRepository(client: SupabaseClient): RelationshipRepository {
  return {
    async findByFromAndTo(fromPlayerId, toPlayerId, type) {
      const { data, error } = await client
        .from('player_relationships')
        .select(RELATIONSHIP_COLUMNS)
        .eq('from_player_id', fromPlayerId)
        .eq('to_player_id', toPlayerId)
        .eq('relationship_type', type)
        .maybeSingle()

      if (error) throw error
      return data as unknown as RelationshipRecord | null
    },

    async findFollowing(playerId, limit, offset) {
      const { data, error } = await client
        .from('player_relationships')
        .select(RELATIONSHIP_COLUMNS)
        .eq('from_player_id', playerId)
        .eq('relationship_type', 'follow')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error
      return (data ?? []) as unknown as RelationshipRecord[]
    },

    async findFollowers(playerId, limit, offset) {
      const { data, error } = await client
        .from('player_relationships')
        .select(RELATIONSHIP_COLUMNS)
        .eq('to_player_id', playerId)
        .eq('relationship_type', 'follow')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error
      return (data ?? []) as unknown as RelationshipRecord[]
    },

    async findBlocked(playerId) {
      const { data, error } = await client
        .from('player_relationships')
        .select(RELATIONSHIP_COLUMNS)
        .eq('from_player_id', playerId)
        .eq('relationship_type', 'block')
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as unknown as RelationshipRecord[]
    },

    async create(fromPlayerId, toPlayerId, type, status) {
      const { data, error } = await client
        .from('player_relationships')
        .insert({
          from_player_id: fromPlayerId,
          to_player_id: toPlayerId,
          relationship_type: type,
          status
        })
        .select(RELATIONSHIP_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as RelationshipRecord
    },

    async updateStatus(id, status) {
      const { data, error } = await client
        .from('player_relationships')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(RELATIONSHIP_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as RelationshipRecord
    },

    async delete(id) {
      const { error } = await client.from('player_relationships').delete().eq('id', id)

      if (error) throw error
    },

    async isBlocked(fromPlayerId, toPlayerId) {
      const { count, error } = await client
        .from('player_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('from_player_id', fromPlayerId)
        .eq('to_player_id', toPlayerId)
        .eq('relationship_type', 'block')

      if (error) throw error
      return (count ?? 0) > 0
    },

    async countFollowers(playerId) {
      const { count, error } = await client
        .from('player_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('to_player_id', playerId)
        .eq('relationship_type', 'follow')
        .eq('status', 'active')

      if (error) throw error
      return count ?? 0
    },

    async findAllMutualFollows(playerId) {
      const { data, error } = await client
        .from('player_relationships')
        .select('from_player_id, to_player_id')
        .eq('relationship_type', 'follow')
        .eq('status', 'active')
        .or(`from_player_id.eq.${playerId},to_player_id.eq.${playerId}`)

      if (error) throw error

      const outgoing = new Set<string>()
      const incoming = new Set<string>()
      for (const row of (data ?? []) as { from_player_id: string; to_player_id: string }[]) {
        if (row.from_player_id === playerId) outgoing.add(row.to_player_id)
        if (row.to_player_id === playerId) incoming.add(row.from_player_id)
      }

      return [...outgoing].filter((id) => incoming.has(id))
    },

    async findMutualFollows(playerId, otherPlayerIds) {
      if (otherPlayerIds.length === 0) return []

      const { data, error } = await client
        .from('player_relationships')
        .select('from_player_id, to_player_id')
        .eq('relationship_type', 'follow')
        .eq('status', 'active')
        .or(
          `and(from_player_id.eq.${playerId},to_player_id.in.(${otherPlayerIds.join(',')})),` +
            `and(to_player_id.eq.${playerId},from_player_id.in.(${otherPlayerIds.join(',')}))`
        )

      if (error) throw error

      // A follow is one row per direction, so mutual means both rows exist.
      const outgoing = new Set<string>()
      const incoming = new Set<string>()
      for (const row of (data ?? []) as { from_player_id: string; to_player_id: string }[]) {
        if (row.from_player_id === playerId) outgoing.add(row.to_player_id)
        else incoming.add(row.from_player_id)
      }

      return otherPlayerIds.filter((id) => outgoing.has(id) && incoming.has(id))
    },

    async countFollowing(playerId) {
      const { count, error } = await client
        .from('player_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('from_player_id', playerId)
        .eq('relationship_type', 'follow')
        .eq('status', 'active')

      if (error) throw error
      return count ?? 0
    }
  }
}
