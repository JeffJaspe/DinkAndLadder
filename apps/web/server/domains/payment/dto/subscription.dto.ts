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
  // 056 — provider-agnostic identity and provenance. The repository has
  // selected these since step 3; the type just never said so.
  provider: PaymentProvider
  provider_subscription_id: string | null
  provider_customer_id: string | null
  source: SubscriptionSource
  granted_by_user_id: string | null
  notes: string | null
  canceled_at: string | null
  ended_at: string | null
}

export interface ClubSubscriptionDto {
  id: string
  club_id: string
  plan_id: string
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  provider: PaymentProvider
  source: SubscriptionSource
  canceled_at: string | null
  ended_at: string | null
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
    provider: record.provider,
    source: record.source,
    canceled_at: record.canceled_at,
    ended_at: record.ended_at,
    plan: plan ? toSubscriptionPlanDto(plan) : undefined
  }
}

/* ------------------------------------------------------------------------- *
 * 056-club-subscriptions
 *
 * Everything below belongs to the club-subscription work. The types above are
 * 013's and are left alone: `SubscriptionPlanFeatures` in particular is frozen
 * legacy — `/subscriptions/me` and the player DTO still read `features`, and
 * nothing added here does. New entitlements live in typed columns, not in that
 * blob, because `-1`-means-unlimited inside untyped jsonb is exactly why
 * `canClubAddMember()` is unsafe and unused.
 * ------------------------------------------------------------------------- */

/**
 * Who moved the money. `manual` is an admin grant with no gateway at all;
 * `simulated` is the zero-charge checkout that exists so the whole flow can be
 * built and tested before a real gateway is chosen.
 */
export type PaymentProvider = 'manual' | 'simulated' | 'stripe' | 'paymongo'

/** How a subscription row came to exist. A grant with no provenance is an audit hole. */
export type SubscriptionSource = 'self_serve' | 'admin_grant' | 'simulated_checkout'

/**
 * Whether real money can move. Not a feature flag — `feature-flags.ts` says in
 * its own docstring that its 30-second cache must never stand in for an
 * authorization check, and this is exactly that.
 */
export type BillingMode = 'off' | 'simulated' | 'live'

/** Where a club's verified badge came from once paying can queue a club for review. */
export type VerificationSource = 'none' | 'admin_review' | 'subscription'

/**
 * One of the big numbers on a pricing card.
 *
 * Free text the SuperAdmin writes, never computed. "3x more reach" is a claim
 * somebody chooses to make, and the platform must not dress a claim as a
 * derived fact.
 */
export interface PlanHeadlineFigure {
  value: string
  label: string
}

/**
 * What a plan actually buys.
 *
 * **`null` means unlimited**, in every numeric field, never `-1`. `null`
 * already means "no ceiling" in SQL, cannot be mistaken for a count, and lets
 * the database `CHECK (col IS NULL OR col >= 0)` mean something. Read these
 * through `isUnlimited()` in `utils/subscription-plan.ts` rather than testing
 * for null at each call site.
 *
 * Note `verified_badge_eligible`: eligible, not granted. Paying puts the club
 * in the verification queue; a human still approves it.
 */
export interface PlanEntitlements {
  max_draft_events: number | null
  max_live_tournaments: number | null
  max_live_open_play: number | null
  max_members: number | null
  online_fee_collection: boolean
  verified_badge_eligible: boolean
  /** Event types this plan can create. null = all types allowed. */
  allowed_event_types: string[] | null
  /**
   * Whether this plan allows creating ranked events (open_ranked, club_ranked, tournament, tournament_club).
   * Verified clubs bypass this check entirely.
   */
  can_create_ranked_events: boolean
}

/** The marketing copy, all of it SuperAdmin-owned. None of this is hardcoded in a template. */
export interface PlanMarketing {
  tagline: string | null
  marketing_bullets: string[]
  headline_figures: PlanHeadlineFigure[]
  badge_label: string | null
  cta_label: string | null
  /**
   * Override only. The annual saving is computed by `describeAnnualSaving()` so
   * it can never disagree with the two prices; this wins when set.
   */
  savings_label: string | null
}

/** The full row, including the columns no public DTO may carry. */
export interface ClubPlanRecord extends SubscriptionPlanRecord {
  tagline: string | null
  marketing_bullets: string[] | null
  headline_figures: PlanHeadlineFigure[] | null
  badge_label: string | null
  cta_label: string | null
  savings_label: string | null
  plan_group: string | null
  is_public: boolean
  is_featured: boolean
  is_default_free: boolean
  max_draft_events: number | null
  max_live_tournaments: number | null
  max_live_open_play: number | null
  max_members: number | null
  online_fee_collection: boolean
  verified_badge_eligible: boolean
  allowed_event_types: string[] | null
  can_create_ranked_events: boolean
}

/**
 * A plan as the public sees it.
 *
 * Deliberately **not** the admin DTO with optional fields. One DTO with
 * `is_public?: boolean` would make "can a draft plan's price leak?" a runtime
 * question answered by whoever remembered to filter; two DTOs make it a
 * compile-time one. Note there is no `features` here — that blob is legacy and
 * nothing new reads it.
 */
export interface ClubSubscriptionPlanDto extends PlanMarketing {
  id: string
  name: string
  description: string | null
  billing_interval: BillingInterval
  price_cents: number
  currency: string
  plan_group: string | null
  is_featured: boolean
  is_default_free: boolean
  entitlements: PlanEntitlements
}

/** The same plan plus the fields that decide whether anyone may see it. */
export interface AdminClubSubscriptionPlanDto extends ClubSubscriptionPlanDto {
  is_active: boolean
  is_public: boolean
  sort_order: number
}

/**
 * jsonb columns arrive as whatever is in the row. The database `CHECK`
 * guarantees an array, but a row written before that constraint — or through
 * the service role, which the CHECK still covers but a typo does not — could
 * hold entries of the wrong shape, and a pricing card is not the place to
 * discover it. Anything that is not a usable entry is dropped.
 */
function toBullets(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

function toHeadlineFigures(value: unknown): PlanHeadlineFigure[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { value: figure, label } = entry as { value?: unknown; label?: unknown }
    if (typeof figure !== 'string' || typeof label !== 'string') return []
    if (figure.trim().length === 0 || label.trim().length === 0) return []
    return [{ value: figure, label }]
  })
}

export function toPlanEntitlements(record: ClubPlanRecord): PlanEntitlements {
  return {
    max_draft_events: record.max_draft_events,
    max_live_tournaments: record.max_live_tournaments,
    max_live_open_play: record.max_live_open_play,
    max_members: record.max_members,
    online_fee_collection: record.online_fee_collection,
    verified_badge_eligible: record.verified_badge_eligible,
    allowed_event_types: record.allowed_event_types,
    can_create_ranked_events: record.can_create_ranked_events ?? false
  }
}

export function toClubSubscriptionPlanDto(record: ClubPlanRecord): ClubSubscriptionPlanDto {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    billing_interval: record.billing_interval,
    price_cents: record.price_cents,
    currency: record.currency,
    plan_group: record.plan_group,
    is_featured: record.is_featured,
    is_default_free: record.is_default_free,
    tagline: record.tagline,
    marketing_bullets: toBullets(record.marketing_bullets),
    headline_figures: toHeadlineFigures(record.headline_figures),
    badge_label: record.badge_label,
    cta_label: record.cta_label,
    savings_label: record.savings_label,
    entitlements: toPlanEntitlements(record)
  }
}

export function toAdminClubSubscriptionPlanDto(
  record: ClubPlanRecord
): AdminClubSubscriptionPlanDto {
  return {
    ...toClubSubscriptionPlanDto(record),
    is_active: record.is_active,
    is_public: record.is_public,
    sort_order: record.sort_order
  }
}
