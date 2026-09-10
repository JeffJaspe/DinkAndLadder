import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type { ClubEntitlements } from '../dto/entitlements.dto'
import type { ClubPlanRecord, ClubSubscriptionRecord } from '../dto/subscription.dto'
import { toPlanEntitlements } from '../dto/subscription.dto'

/**
 * What a club is allowed to do when nothing else can answer.
 *
 * **This is today's behaviour, exactly** — the three `>= 1` literals
 * `event.service.ts` has enforced since the limits were introduced, plus the
 * member ceiling it never had. That is the whole point: the fallback has to be
 * what already happens.
 *
 * Making it unlimited would be a silent regression that hands every club a free
 * paid tier the first time a plan row goes missing. Making it zero would lock
 * every club out of its own events over a bad read. Neither failure is
 * acceptable, so the fallback is the status quo.
 */
export const SAFE_DEFAULT_ENTITLEMENTS = {
  max_draft_events: 1,
  max_live_tournaments: 1,
  max_live_open_play: 1,
  max_members: null,
  online_fee_collection: false,
  verified_badge_eligible: false
} as const

export interface ClubEntitlementsService {
  resolve(clubId: string): Promise<ClubEntitlements>
  /** A page of clubs in two queries rather than 2N. */
  resolveMany(clubIds: string[]): Promise<Map<string, ClubEntitlements>>
}

export interface ClubEntitlementsOptions {
  /**
   * How long a lapsed subscription keeps working. Comes from
   * `platform_config.subscription_grace_days`; defaulted here so a caller that
   * cannot read config still behaves like the product intends.
   */
  graceDays?: number
  /** Injectable clock. Grace windows are impossible to test against a real one. */
  now?: () => Date
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Does this subscription entitle the club **right now**?
 *
 * Two of these rows are decisions, not bookkeeping:
 *
 * - **`trialing` counts.** Today `subscription.service.ts` requires
 *   `status === 'active'`, so a club in a trial silently gets free-tier
 *   features while the UI shows it a paid plan. That is a live bug and this
 *   fixes it.
 * - **`canceled` with the period still running counts.** They paid for the
 *   month; cancelling is a decision about the *next* one. This case is only
 *   reachable because `findLatestForClub` does not filter by status, which is
 *   what makes that repository change load-bearing rather than cosmetic.
 *
 * `past_due` is a failed card, not a decision to leave, so it keeps working
 * until the period ends *and* the grace window closes.
 */
function entitlesNow(
  sub: ClubSubscriptionRecord,
  now: Date,
  graceDays: number
): { entitled: boolean; inGrace: boolean } {
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null
  const periodEnded = periodEnd !== null && periodEnd.getTime() <= now.getTime()
  const withinGrace =
    periodEnd !== null && now.getTime() <= periodEnd.getTime() + graceDays * DAY_MS

  switch (sub.status) {
    case 'active':
    case 'trialing':
      return { entitled: true, inGrace: false }

    case 'past_due':
      // No period end recorded means there is nothing to have run out.
      if (!periodEnded) return { entitled: true, inGrace: false }
      return { entitled: withinGrace, inGrace: withinGrace }

    case 'canceled':
      // A cancellation with no period end is immediate.
      if (periodEnd === null) return { entitled: false, inGrace: false }
      return { entitled: !periodEnded, inGrace: false }

    case 'paused':
    case 'incomplete':
      return { entitled: false, inGrace: false }

    default:
      return { entitled: false, inGrace: false }
  }
}

/**
 * The one place that answers "what may this club do?".
 *
 * **No caching.** `server/utils/feature-flags.ts` earns its 30-second cache
 * because a flag is decoration; an entitlement gates a refusal, and that file's
 * own docstring warns against exactly this reuse. A club that has just paid
 * must not be told to wait half a minute for its own event.
 */
export function createClubEntitlementsService(
  subscriptions: SubscriptionRepository,
  options: ClubEntitlementsOptions = {}
): ClubEntitlementsService {
  const graceDays = options.graceDays ?? 7
  const clock = options.now ?? (() => new Date())

  function fromPlan(
    plan: ClubPlanRecord,
    sub: ClubSubscriptionRecord | null,
    origin: ClubEntitlements['origin'],
    inGrace: boolean
  ): ClubEntitlements {
    return {
      ...toPlanEntitlements(plan),
      plan_id: plan.id,
      plan_name: plan.name,
      origin,
      status: sub?.status ?? null,
      current_period_end: sub?.current_period_end ?? null,
      in_grace: inGrace
    }
  }

  function fallback(sub: ClubSubscriptionRecord | null): ClubEntitlements {
    return {
      ...SAFE_DEFAULT_ENTITLEMENTS,
      plan_id: null,
      plan_name: 'Free',
      origin: 'fallback',
      status: sub?.status ?? null,
      current_period_end: sub?.current_period_end ?? null,
      in_grace: false
    }
  }

  return {
    async resolve(clubId) {
      const now = clock()
      const sub = await subscriptions.findLatestForClub(clubId)

      if (sub) {
        const { entitled, inGrace } = entitlesNow(sub, now, graceDays)
        if (entitled) {
          const plan = await subscriptions.getClubPlanById(sub.plan_id)
          // A subscription pointing at a plan that cannot be read is a broken
          // row, not a free upgrade — fall through to the default plan.
          if (plan) return fromPlan(plan, sub, 'plan', inGrace)
        }
      }

      const defaultPlan = await subscriptions.getDefaultFreePlan()
      if (defaultPlan) return fromPlan(defaultPlan, sub, 'default_plan', false)

      return fallback(sub)
    },

    async resolveMany(clubIds) {
      const result = new Map<string, ClubEntitlements>()
      if (clubIds.length === 0) return result

      const now = clock()

      // Newest first from the repository, so the first row seen for a club is
      // its latest — the same row resolve() would have picked.
      const rows = await subscriptions.listClubSubscriptions({
        clubIds,
        limit: Math.max(clubIds.length * 4, 100)
      })

      const latestByClub = new Map<string, ClubSubscriptionRecord>()
      for (const row of rows) {
        if (!latestByClub.has(row.club_id)) latestByClub.set(row.club_id, row)
      }

      const entitledPlanIds = new Set<string>()
      for (const sub of latestByClub.values()) {
        if (entitlesNow(sub, now, graceDays).entitled) entitledPlanIds.add(sub.plan_id)
      }

      const [plans, defaultPlan] = await Promise.all([
        subscriptions.getPlansByIds([...entitledPlanIds]),
        subscriptions.getDefaultFreePlan()
      ])
      const planById = new Map(plans.map((p) => [p.id, p]))

      for (const clubId of clubIds) {
        const sub = latestByClub.get(clubId) ?? null
        const state = sub ? entitlesNow(sub, now, graceDays) : { entitled: false, inGrace: false }
        const plan = sub && state.entitled ? (planById.get(sub.plan_id) ?? null) : null

        if (plan) {
          result.set(clubId, fromPlan(plan, sub, 'plan', state.inGrace))
        } else if (defaultPlan) {
          result.set(clubId, fromPlan(defaultPlan, sub, 'default_plan', false))
        } else {
          result.set(clubId, fallback(sub))
        }
      }

      return result
    }
  }
}

/**
 * The entitlements a club has when nothing has been wired to resolve them.
 *
 * `event.service.ts` takes its entitlements service as an optional dependency,
 * the same as every other one. But "not wired" must not mean "no limits" — that
 * would delete every ceiling the moment a call site forgot an argument. It
 * means the status quo instead, which is what this is.
 */
export function verifiedOverrideEntitlements(): ClubEntitlements {
  return {
    max_draft_events: null,
    max_live_tournaments: null,
    max_live_open_play: null,
    max_members: null,
    online_fee_collection: false,
    verified_badge_eligible: true,
    plan_id: null,
    plan_name: 'Verified club',
    origin: 'verified_override',
    status: null,
    current_period_end: null,
    in_grace: false
  }
}

export function unwiredEntitlements(): ClubEntitlements {
  return {
    ...SAFE_DEFAULT_ENTITLEMENTS,
    plan_id: null,
    plan_name: 'Free',
    origin: 'fallback',
    status: null,
    current_period_end: null,
    in_grace: false
  }
}
