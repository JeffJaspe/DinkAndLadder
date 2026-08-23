import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DefaultPartnerRecord,
  PartnershipRecord,
  PartnerRequestRecord,
  PartnerRequestStatus
} from '../dto/partnership.dto'

export interface PartnershipRepository {
  // Partnerships
  findPartners(playerId: string): Promise<PartnershipRecord[]>
  findPartnershipBetween(player1Id: string, player2Id: string): Promise<PartnershipRecord | null>
  createPartnership(player1Id: string, player2Id: string): Promise<PartnershipRecord>
  deletePartnership(id: string): Promise<void>
  countPartners(playerId: string): Promise<number>

  // Partner requests
  findPendingRequestsTo(playerId: string): Promise<PartnerRequestRecord[]>
  findPendingRequestsFrom(playerId: string): Promise<PartnerRequestRecord[]>
  findRequestBetween(fromPlayerId: string, toPlayerId: string): Promise<PartnerRequestRecord | null>
  findRequestById(id: string): Promise<PartnerRequestRecord | null>
  createRequest(
    fromPlayerId: string,
    toPlayerId: string,
    message?: string
  ): Promise<PartnerRequestRecord>
  updateRequestStatus(id: string, status: PartnerRequestStatus): Promise<PartnerRequestRecord>

  // Default duo
  findDefaultPartner(playerId: string): Promise<DefaultPartnerRecord | null>
  upsertDefaultPartner(playerId: string, partnerId: string): Promise<DefaultPartnerRecord>
  clearDefaultPartner(playerId: string): Promise<void>
}

export function createPartnershipRepository(client: SupabaseClient): PartnershipRepository {
  return {
    async findPartners(playerId) {
      const { data, error } = await client
        .from('partnerships')
        .select('*')
        .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)

      if (error) throw error
      return (data ?? []) as PartnershipRecord[]
    },

    async findPartnershipBetween(player1Id, player2Id) {
      // Ensure ordering for the constraint
      const [p1, p2] = player1Id < player2Id ? [player1Id, player2Id] : [player2Id, player1Id]

      const { data, error } = await client
        .from('partnerships')
        .select('*')
        .eq('player1_id', p1)
        .eq('player2_id', p2)
        .maybeSingle()

      if (error) throw error
      return data as PartnershipRecord | null
    },

    async createPartnership(player1Id, player2Id) {
      // Ensure ordering for the constraint
      const [p1, p2] = player1Id < player2Id ? [player1Id, player2Id] : [player2Id, player1Id]

      const { data, error } = await client
        .from('partnerships')
        .insert({ player1_id: p1, player2_id: p2 })
        .select()
        .single()

      if (error) throw error
      return data as PartnershipRecord
    },

    async deletePartnership(id) {
      const { error } = await client.from('partnerships').delete().eq('id', id)
      if (error) throw error
    },

    async countPartners(playerId) {
      const { count, error } = await client
        .from('partnerships')
        .select('*', { count: 'exact', head: true })
        .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)

      if (error) throw error
      return count ?? 0
    },

    async findPendingRequestsTo(playerId) {
      const { data, error } = await client
        .from('partner_requests')
        .select('*')
        .eq('to_player_id', playerId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as PartnerRequestRecord[]
    },

    async findPendingRequestsFrom(playerId) {
      const { data, error } = await client
        .from('partner_requests')
        .select('*')
        .eq('from_player_id', playerId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as PartnerRequestRecord[]
    },

    async findRequestBetween(fromPlayerId, toPlayerId) {
      const { data, error } = await client
        .from('partner_requests')
        .select('*')
        .eq('from_player_id', fromPlayerId)
        .eq('to_player_id', toPlayerId)
        .eq('status', 'pending')
        .maybeSingle()

      if (error) throw error
      return data as PartnerRequestRecord | null
    },

    async findRequestById(id) {
      const { data, error } = await client
        .from('partner_requests')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return data as PartnerRequestRecord | null
    },

    async createRequest(fromPlayerId, toPlayerId, message) {
      const { data, error } = await client
        .from('partner_requests')
        .insert({
          from_player_id: fromPlayerId,
          to_player_id: toPlayerId,
          message: message ?? null,
          status: 'pending'
        })
        .select()
        .single()

      if (error) throw error
      return data as PartnerRequestRecord
    },

    async updateRequestStatus(id, status) {
      const { data, error } = await client
        .from('partner_requests')
        .update({
          status,
          responded_at: status !== 'pending' ? new Date().toISOString() : null
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as PartnerRequestRecord
    },

    async findDefaultPartner(playerId) {
      const { data, error } = await client
        .from('player_default_partners')
        .select('*')
        .eq('player_id', playerId)
        .maybeSingle()

      if (error) throw error
      return data as DefaultPartnerRecord | null
    },

    // player_id is the primary key, so an upsert is what "change your duo"
    // means — there is never a second row to clean up first.
    async upsertDefaultPartner(playerId, partnerId) {
      const { data, error } = await client
        .from('player_default_partners')
        .upsert(
          { player_id: playerId, partner_id: partnerId, updated_at: new Date().toISOString() },
          { onConflict: 'player_id' }
        )
        .select()
        .single()

      if (error) throw error
      return data as DefaultPartnerRecord
    },

    async clearDefaultPartner(playerId) {
      const { error } = await client
        .from('player_default_partners')
        .delete()
        .eq('player_id', playerId)

      if (error) throw error
    }
  }
}
