import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SponsorshipRecord,
  SponsorshipStatus,
  SponsorshipTargetType
} from '../dto/sponsorship.dto'

const COLUMNS =
  'id, sponsor_player_id, target_type, target_id, amount_cents, currency, message, is_anonymous, stripe_payment_intent_id, status, created_at, updated_at'

export interface SponsorshipRepository {
  create(input: CreateSponsorshipRecordInput): Promise<SponsorshipRecord>
  findById(id: string): Promise<SponsorshipRecord | null>
  findByStripePaymentIntent(stripePaymentIntentId: string): Promise<SponsorshipRecord | null>
  updateStatus(id: string, status: SponsorshipStatus): Promise<SponsorshipRecord>
  listGivenByPlayer(playerId: string, limit?: number): Promise<SponsorshipRecord[]>
  listReceivedByTarget(
    targetType: SponsorshipTargetType,
    targetId: string,
    limit?: number
  ): Promise<SponsorshipRecord[]>
  sumReceivedByTarget(targetType: SponsorshipTargetType, targetId: string): Promise<number>
}

export interface CreateSponsorshipRecordInput {
  sponsor_player_id: string
  target_type: SponsorshipTargetType
  target_id: string
  amount_cents: number
  currency?: string
  message?: string
  is_anonymous?: boolean
  stripe_payment_intent_id?: string
  status: SponsorshipStatus
}

export function createSponsorshipRepository(client: SupabaseClient): SponsorshipRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from('sponsorships')
        .insert({
          ...input,
          currency: input.currency ?? 'php',
          is_anonymous: input.is_anonymous ?? false
        })
        .select(COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as SponsorshipRecord
    },

    async findById(id) {
      const { data, error } = await client
        .from('sponsorships')
        .select(COLUMNS)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return data as unknown as SponsorshipRecord | null
    },

    async findByStripePaymentIntent(stripePaymentIntentId) {
      const { data, error } = await client
        .from('sponsorships')
        .select(COLUMNS)
        .eq('stripe_payment_intent_id', stripePaymentIntentId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as SponsorshipRecord | null
    },

    async updateStatus(id, status) {
      const { data, error } = await client
        .from('sponsorships')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as SponsorshipRecord
    },

    async listGivenByPlayer(playerId, limit = 50) {
      const { data, error } = await client
        .from('sponsorships')
        .select(COLUMNS)
        .eq('sponsor_player_id', playerId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data as unknown as SponsorshipRecord[]
    },

    async listReceivedByTarget(targetType, targetId, limit = 50) {
      const { data, error } = await client
        .from('sponsorships')
        .select(COLUMNS)
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data as unknown as SponsorshipRecord[]
    },

    async sumReceivedByTarget(targetType, targetId) {
      const { data, error } = await client
        .from('sponsorships')
        .select('amount_cents')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .eq('status', 'completed')

      if (error) throw error
      const records = data as unknown as { amount_cents: number }[]
      return records.reduce((sum, r) => sum + r.amount_cents, 0)
    }
  }
}
