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
