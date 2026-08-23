export type BillingInterval = 'month' | 'year' | 'one_time'
export type PlanType = 'player' | 'club'
export type SubscriptionStatus =
  'active' | 'canceled' | 'past_due' | 'trialing' | 'paused' | 'incomplete'

export interface SubscriptionPlanFeatures {
  max_matches_per_month?: number
  max_clubs?: number
  analytics?: boolean
  ad_free?: boolean
  priority_registration?: boolean
  max_members?: number
  announcements?: boolean
  tournaments?: boolean
  priority_support?: boolean
}

export interface SubscriptionPlanRecord {
  id: string
  name: string
  description: string | null
  stripe_price_id: string | null
  billing_interval: BillingInterval
  price_cents: number
  currency: string
  features: SubscriptionPlanFeatures
  plan_type: PlanType
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SubscriptionPlanDto {
  id: string
  name: string
  description: string | null
  billing_interval: BillingInterval
  price_cents: number
  currency: string
  features: SubscriptionPlanFeatures
  plan_type: PlanType
}

export function toSubscriptionPlanDto(record: SubscriptionPlanRecord): SubscriptionPlanDto {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    billing_interval: record.billing_interval,
    price_cents: record.price_cents,
    currency: record.currency,
    features: record.features,
    plan_type: record.plan_type
  }
}

export interface PlayerSubscriptionRecord {
  id: string
  player_id: string
  plan_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
}

export interface PlayerSubscriptionDto {
  id: string
  player_id: string
  plan_id: string
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  plan?: SubscriptionPlanDto
}

export function toPlayerSubscriptionDto(
  record: PlayerSubscriptionRecord,
  plan?: SubscriptionPlanRecord
): PlayerSubscriptionDto {
  return {
    id: record.id,
    player_id: record.player_id,
    plan_id: record.plan_id,
    status: record.status,
    current_period_start: record.current_period_start,
    current_period_end: record.current_period_end,
    cancel_at_period_end: record.cancel_at_period_end,
    plan: plan ? toSubscriptionPlanDto(plan) : undefined
  }
}

export interface ClubSubscriptionRecord {
  id: string
  club_id: string
  plan_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
}

export interface ClubSubscriptionDto {
  id: string
  club_id: string
  plan_id: string
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  plan?: SubscriptionPlanDto
}

export function toClubSubscriptionDto(
  record: ClubSubscriptionRecord,
  plan?: SubscriptionPlanRecord
): ClubSubscriptionDto {
  return {
    id: record.id,
    club_id: record.club_id,
    plan_id: record.plan_id,
    status: record.status,
    current_period_start: record.current_period_start,
    current_period_end: record.current_period_end,
    cancel_at_period_end: record.cancel_at_period_end,
    plan: plan ? toSubscriptionPlanDto(plan) : undefined
  }
}
