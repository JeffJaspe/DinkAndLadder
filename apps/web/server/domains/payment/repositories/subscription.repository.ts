import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SubscriptionPlanRecord,
  PlayerSubscriptionRecord,
  ClubSubscriptionRecord,
  ClubPlanRecord,
  PaymentProvider,
  PlanType,
  SubscriptionSource,
  SubscriptionStatus,
  PlanHeadlineFigure
} from '../dto/subscription.dto'

/**
 * A column absent from a Supabase select list comes back as `undefined`, not as
 * an error. For an entitlement column that is the worst possible failure: an
 * omitted `max_live_tournaments` reads as `undefined`, which is not a number,
 * which every "is there a ceiling?" test treats as **unlimited**. So these
 * lists carry every column, and adding a column to the table means adding it
 * here in the same change.
 */
const PLAN_COLUMNS =
  'id, name, description, stripe_price_id, billing_interval, price_cents, currency, features, plan_type, is_active, sort_order, created_at, updated_at, ' +
  'tagline, marketing_bullets, headline_figures, badge_label, cta_label, savings_label, plan_group, is_public, is_featured, is_default_free, ' +
  'max_draft_events, max_live_tournaments, max_live_open_play, max_members, online_fee_collection, verified_badge_eligible, ' +
  'allowed_event_types, can_create_ranked_events'

const PLAYER_SUB_COLUMNS =
  'id, player_id, plan_id, stripe_subscription_id, stripe_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at'

const CLUB_SUB_COLUMNS =
  'id, club_id, plan_id, stripe_subscription_id, stripe_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at, ' +
  'provider, provider_subscription_id, provider_customer_id, source, granted_by_user_id, notes, canceled_at, ended_at'

/** The statuses that mean a club is currently entitled to what it pays for. */
export const LIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['active', 'trialing', 'past_due']

export interface SubscriptionRepository {
  listActivePlans(planType?: PlanType): Promise<SubscriptionPlanRecord[]>
  getPlanById(planId: string): Promise<SubscriptionPlanRecord | null>

  getPlayerSubscription(playerId: string): Promise<PlayerSubscriptionRecord | null>
  getPlayerSubscriptionByStripeId(stripeSubId: string): Promise<PlayerSubscriptionRecord | null>
  createPlayerSubscription(input: CreatePlayerSubscriptionInput): Promise<PlayerSubscriptionRecord>
  updatePlayerSubscription(
    id: string,
    input: UpdateSubscriptionInput
  ): Promise<PlayerSubscriptionRecord>

  getClubSubscription(clubId: string): Promise<ClubSubscriptionRecord | null>
  /**
   * The club's newest subscription row, **whatever its status**.
   *
   * `getClubSubscription` filters to the live statuses, which is a business
   * judgement living in a repository: it hides a `canceled`-but-still-in-period
   * month the club has already paid for, and a service that cannot see that row
   * cannot honour it. Repositories fetch; services judge.
   */
  findLatestForClub(clubId: string): Promise<ClubSubscriptionRecord | null>
  findClubSubscriptionById(id: string): Promise<ClubSubscriptionRecord | null>
  getClubSubscriptionByStripeId(stripeSubId: string): Promise<ClubSubscriptionRecord | null>
  createClubSubscription(input: CreateClubSubscriptionInput): Promise<ClubSubscriptionRecord>
  updateClubSubscription(
    id: string,
    input: UpdateSubscriptionInput
  ): Promise<ClubSubscriptionRecord>
  listClubSubscriptions(filter?: ClubSubscriptionFilter): Promise<ClubSubscriptionRecord[]>
  /**
   * Subscriptions whose paid period ended before `before` and that nobody has
   * closed yet (`ended_at IS NULL`). What the lapse sweep reads.
   *
   * No gateway means no webhook will ever flip a status, so an admin grant of
   * three months would entitle the club forever without this. The service
   * decides which of these rows has actually lapsed (grace applies to
   * `past_due`); the repository only finds the candidates.
   */
  findLapsedCandidates(before: string, limit?: number): Promise<ClubSubscriptionRecord[]>

  /* --- Club plans (056). Service-role callers only; see 0008's RLS note. --- */

  /** Every club plan a member of the public may see. */
  listPublicClubPlans(): Promise<ClubPlanRecord[]>
  /** Every plan, published or not. The admin list. */
  listPlansForAdmin(planType?: PlanType): Promise<ClubPlanRecord[]>
  getClubPlanById(planId: string): Promise<ClubPlanRecord | null>
  /** Several plans in one round trip, for resolving a page of clubs at once. */
  getPlansByIds(planIds: string[]): Promise<ClubPlanRecord[]>
  /** What a club with no subscription resolves to. */
  getDefaultFreePlan(): Promise<ClubPlanRecord | null>
  createPlan(input: CreatePlanInput): Promise<ClubPlanRecord>
  updatePlan(planId: string, input: UpdatePlanInput): Promise<ClubPlanRecord>
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

/**
 * **This type is the single reason no club write path was ever built.**
 *
 * It required `stripe_subscription_id` and `stripe_customer_id` as non-optional
 * strings, so a manual grant, an admin grant, or a simulated checkout could not
 * satisfy it — and 013 shipped with no gateway, so nothing ever could.
 *
 * Provider identity is now optional and generic, and `source` records how the
 * row came to exist.
 */
export interface CreateClubSubscriptionInput {
  club_id: string
  plan_id: string
  status: SubscriptionStatus
  provider: PaymentProvider
  source: SubscriptionSource
  provider_subscription_id?: string | null
  provider_customer_id?: string | null
  /** Required in practice for `admin_grant`; the service enforces that, not the type. */
  granted_by_user_id?: string | null
  notes?: string | null
  current_period_start?: string
  current_period_end?: string
}

export interface UpdateSubscriptionInput {
  status?: SubscriptionStatus
  current_period_start?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean
  canceled_at?: string | null
  ended_at?: string | null
  provider_subscription_id?: string | null
  provider_customer_id?: string | null
  notes?: string | null
}

export interface ClubSubscriptionFilter {
  clubId?: string
  /** Several clubs in one round trip — what resolveMany() uses instead of N queries. */
  clubIds?: string[]
  status?: SubscriptionStatus[]
  provider?: PaymentProvider
  limit?: number
}

/** Everything a plan needs to exist. Marketing and entitlements both default to empty/free. */
export interface CreatePlanInput {
  name: string
  plan_type: PlanType
  billing_interval: 'month' | 'year'
  price_cents: number
  currency?: string
  description?: string | null
  plan_group?: string | null
  sort_order?: number
  is_active?: boolean
  /** Defaults false. Publishing is a separate, deliberate act — never a side effect of creating. */
  is_public?: boolean
  is_featured?: boolean
  tagline?: string | null
  marketing_bullets?: string[]
  headline_figures?: PlanHeadlineFigure[]
  badge_label?: string | null
  cta_label?: string | null
  savings_label?: string | null
  max_draft_events?: number | null
  max_live_tournaments?: number | null
  max_live_open_play?: number | null
  max_members?: number | null
  online_fee_collection?: boolean
  verified_badge_eligible?: boolean
  allowed_event_types?: string[] | null
  can_create_ranked_events?: boolean
}

/**
 * Every field of a plan is editable except two.
 *
 * `plan_type` is absent because moving a plan between player and club would
 * silently retarget every subscription holding it. `is_default_free` is absent
 * because exactly one row may carry it — the database enforces that with a
 * unique index, and a straight `update` would fail confusingly against it. That
 * move needs its own deliberate operation, not a patch field.
 */
export type UpdatePlanInput = Partial<Omit<CreatePlanInput, 'plan_type'>>

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

    async listPublicClubPlans() {
      const { data, error } = await client
        .from('subscription_plans')
        .select(PLAN_COLUMNS)
        .eq('plan_type', 'club')
        .eq('is_public', true)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return (data ?? []) as unknown as ClubPlanRecord[]
    },

    async listPlansForAdmin(planType) {
      let query = client
        .from('subscription_plans')
        .select(PLAN_COLUMNS)
        .order('plan_type', { ascending: true })
        .order('sort_order', { ascending: true })

      if (planType) {
        query = query.eq('plan_type', planType)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as ClubPlanRecord[]
    },

    async getClubPlanById(planId) {
      const { data, error } = await client
        .from('subscription_plans')
        .select(PLAN_COLUMNS)
        .eq('id', planId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ClubPlanRecord | null
    },

    async getPlansByIds(planIds) {
      if (planIds.length === 0) return []

      const { data, error } = await client
        .from('subscription_plans')
        .select(PLAN_COLUMNS)
        .in('id', planIds)

      if (error) throw error
      return (data ?? []) as unknown as ClubPlanRecord[]
    },

    async getDefaultFreePlan() {
      const { data, error } = await client
        .from('subscription_plans')
        .select(PLAN_COLUMNS)
        .eq('is_default_free', true)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ClubPlanRecord | null
    },

    async createPlan(input) {
      const { data, error } = await client
        .from('subscription_plans')
        .insert({
          currency: 'php',
          sort_order: 0,
          is_active: true,
          // Not defaulted from the caller's optimism: a plan is created
          // unpublished and published later, on purpose.
          is_public: false,
          is_featured: false,
          marketing_bullets: [],
          headline_figures: [],
          online_fee_collection: false,
          verified_badge_eligible: false,
          allowed_event_types: null,
          can_create_ranked_events: false,
          ...input
        })
        .select(PLAN_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as ClubPlanRecord
    },

    async updatePlan(planId, input) {
      const { data, error } = await client
        .from('subscription_plans')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', planId)
        .select(PLAN_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as ClubPlanRecord
    },

    async getPlayerSubscription(playerId) {
      const { data, error } = await client
        .from('player_subscriptions')
        .select(PLAYER_SUB_COLUMNS)
        .eq('player_id', playerId)
        .in('status', LIVE_SUBSCRIPTION_STATUSES)
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
        .in('status', LIVE_SUBSCRIPTION_STATUSES)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ClubSubscriptionRecord | null
    },

    async findLatestForClub(clubId) {
      const { data, error } = await client
        .from('club_subscriptions')
        .select(CLUB_SUB_COLUMNS)
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ClubSubscriptionRecord | null
    },

    async findClubSubscriptionById(id) {
      const { data, error } = await client
        .from('club_subscriptions')
        .select(CLUB_SUB_COLUMNS)
        .eq('id', id)
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
    },

    async listClubSubscriptions(filter = {}) {
      let query = client
        .from('club_subscriptions')
        .select(CLUB_SUB_COLUMNS)
        .order('created_at', { ascending: false })

      if (filter.clubId) query = query.eq('club_id', filter.clubId)
      if (filter.clubIds) {
        // An empty list means "no clubs", and `.in('club_id', [])` is a round
        // trip that can only come back empty.
        if (filter.clubIds.length === 0) return []
        query = query.in('club_id', filter.clubIds)
      }
      if (filter.status && filter.status.length > 0) query = query.in('status', filter.status)
      if (filter.provider) query = query.eq('provider', filter.provider)
      // Bounded by default. An admin list that grows with the business and was
      // never paginated is a page that eventually stops loading.
      query = query.limit(filter.limit ?? 100)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as ClubSubscriptionRecord[]
    },

    async findLapsedCandidates(before, limit = 200) {
      const { data, error } = await client
        .from('club_subscriptions')
        .select(CLUB_SUB_COLUMNS)
        .is('ended_at', null)
        .not('current_period_end', 'is', null)
        .lt('current_period_end', before)
        .in('status', [...LIVE_SUBSCRIPTION_STATUSES, 'canceled'])
        .order('current_period_end', { ascending: true })
        .limit(limit)

      if (error) throw error
      return (data ?? []) as unknown as ClubSubscriptionRecord[]
    }
  }
}
