import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SubscriptionPlanRecord,
  PlayerSubscriptionRecord,
  ClubSubscriptionRecord,
  PlanType,
  SubscriptionStatus
} from '../dto/subscription.dto'

const PLAN_COLUMNS =
  'id, name, description, stripe_price_id, billing_interval, price_cents, currency, features, plan_type, is_active, sort_order, created_at, updated_at'
const PLAYER_SUB_COLUMNS =
  'id, player_id, plan_id, stripe_subscription_id, stripe_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at'
const CLUB_SUB_COLUMNS =
  'id, club_id, plan_id, stripe_subscription_id, stripe_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at'

export interface SubscriptionRepository {
  listActivePlans(planType?: PlanType): Promise<SubscriptionPlanRecord[]>
  getPlanById(planId: string): Promise<SubscriptionPlanRecord | null>
  getPlanByStripeId(stripePriceId: string): Promise<SubscriptionPlanRecord | null>

  getPlayerSubscription(playerId: string): Promise<PlayerSubscriptionRecord | null>
  getPlayerSubscriptionByStripeId(stripeSubId: string): Promise<PlayerSubscriptionRecord | null>
  createPlayerSubscription(input: CreatePlayerSubscriptionInput): Promise<PlayerSubscriptionRecord>
  updatePlayerSubscription(
    id: string,
    input: UpdateSubscriptionInput
  ): Promise<PlayerSubscriptionRecord>

  getClubSubscription(clubId: string): Promise<ClubSubscriptionRecord | null>
  getClubSubscriptionByStripeId(stripeSubId: string): Promise<ClubSubscriptionRecord | null>
  createClubSubscription(input: CreateClubSubscriptionInput): Promise<ClubSubscriptionRecord>
  updateClubSubscription(
    id: string,
    input: UpdateSubscriptionInput
  ): Promise<ClubSubscriptionRecord>
}

export interface CreatePlayerSubscriptionInput {
  player_id: string
  plan_id: string
  stripe_subscription_id: string
  stripe_customer_id: string
  status: SubscriptionStatus
  current_period_start?: string
  current_period_end?: string
}

export interface CreateClubSubscriptionInput {
  club_id: string
  plan_id: string
  stripe_subscription_id: string
  stripe_customer_id: string
  status: SubscriptionStatus
  current_period_start?: string
  current_period_end?: string
}

export interface UpdateSubscriptionInput {
  status?: SubscriptionStatus
  current_period_start?: string
  current_period_end?: string
  cancel_at_period_end?: boolean
}

export function createSubscriptionRepository(client: SupabaseClient): SubscriptionRepository {
  return {
    async listActivePlans(planType) {
      let query = client
        .from('subscription_plans')
        .select(PLAN_COLUMNS)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (planType) {
        query = query.eq('plan_type', planType)
      }

      const { data, error } = await query
      if (error) throw error
      return data as unknown as SubscriptionPlanRecord[]
    },

    async getPlanById(planId) {
      const { data, error } = await client
        .from('subscription_plans')
        .select(PLAN_COLUMNS)
        .eq('id', planId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as SubscriptionPlanRecord | null
    },

    async getPlanByStripeId(stripePriceId) {
      const { data, error } = await client
        .from('subscription_plans')
        .select(PLAN_COLUMNS)
        .eq('stripe_price_id', stripePriceId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as SubscriptionPlanRecord | null
    },

    async getPlayerSubscription(playerId) {
      const { data, error } = await client
        .from('player_subscriptions')
        .select(PLAYER_SUB_COLUMNS)
        .eq('player_id', playerId)
        .in('status', ['active', 'trialing', 'past_due'])
        .maybeSingle()

      if (error) throw error
      return data as unknown as PlayerSubscriptionRecord | null
    },

    async getPlayerSubscriptionByStripeId(stripeSubId) {
      const { data, error } = await client
        .from('player_subscriptions')
        .select(PLAYER_SUB_COLUMNS)
        .eq('stripe_subscription_id', stripeSubId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as PlayerSubscriptionRecord | null
    },

    async createPlayerSubscription(input) {
      const { data, error } = await client
        .from('player_subscriptions')
        .insert(input)
        .select(PLAYER_SUB_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as PlayerSubscriptionRecord
    },

    async updatePlayerSubscription(id, input) {
      const { data, error } = await client
        .from('player_subscriptions')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(PLAYER_SUB_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as PlayerSubscriptionRecord
    },

    async getClubSubscription(clubId) {
      const { data, error } = await client
        .from('club_subscriptions')
        .select(CLUB_SUB_COLUMNS)
        .eq('club_id', clubId)
        .in('status', ['active', 'trialing', 'past_due'])
        .maybeSingle()

      if (error) throw error
      return data as unknown as ClubSubscriptionRecord | null
    },

    async getClubSubscriptionByStripeId(stripeSubId) {
      const { data, error } = await client
        .from('club_subscriptions')
        .select(CLUB_SUB_COLUMNS)
        .eq('stripe_subscription_id', stripeSubId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ClubSubscriptionRecord | null
    },

    async createClubSubscription(input) {
      const { data, error } = await client
        .from('club_subscriptions')
        .insert(input)
        .select(CLUB_SUB_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as ClubSubscriptionRecord
    },

    async updateClubSubscription(id, input) {
      const { data, error } = await client
        .from('club_subscriptions')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(CLUB_SUB_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as ClubSubscriptionRecord
    }
  }
}
