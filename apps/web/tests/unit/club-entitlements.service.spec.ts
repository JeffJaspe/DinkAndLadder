import { describe, it, expect, vi } from 'vitest'
import {
  createClubEntitlementsService,
  SAFE_DEFAULT_ENTITLEMENTS
} from '~/server/domains/payment/services/club-entitlements.service'
import type { SubscriptionRepository } from '~/server/domains/payment/repositories/subscription.repository'
import type {
  ClubPlanRecord,
  ClubSubscriptionRecord,
  SubscriptionStatus
} from '~/server/domains/payment/dto/subscription.dto'

const NOW = new Date('2026-09-15T12:00:00.000Z')
const now = () => NOW

function planRecord(over: Partial<ClubPlanRecord> = {}): ClubPlanRecord {
  return {
    id: 'plan-premium',
    name: 'Premium',
    description: null,
    stripe_price_id: null,
    billing_interval: 'month',
    price_cents: 99900,
    currency: 'php',
    features: {},
    plan_type: 'club',
    is_active: true,
    sort_order: 10,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    tagline: null,
    marketing_bullets: [],
    headline_figures: [],
    badge_label: null,
    cta_label: null,
    savings_label: null,
    plan_group: 'club-premium',
    is_public: false,
    is_featured: false,
    is_default_free: false,
    max_draft_events: null,
    max_live_tournaments: null,
    max_live_open_play: null,
    max_members: null,
    online_fee_collection: true,
    verified_badge_eligible: true,
    allowed_event_types: null,
    can_create_ranked_events: true,
    ...over
  }
}

/** The 0009 seed, as it actually is in the database. */
function freePlanRecord(): ClubPlanRecord {
  return planRecord({
    id: 'plan-free',
    name: 'Free',
    price_cents: 0,
    plan_group: 'club-free',
    is_public: true,
    is_default_free: true,
    max_draft_events: 1,
    max_live_tournaments: 1,
    max_live_open_play: 1,
    max_members: null,
    online_fee_collection: false,
    verified_badge_eligible: false
  })
}

function subRecord(over: Partial<ClubSubscriptionRecord> = {}): ClubSubscriptionRecord {
  return {
    id: 'sub-1',
    club_id: 'club-1',
    plan_id: 'plan-premium',
    stripe_subscription_id: null,
    stripe_customer_id: null,
    status: 'active',
    current_period_start: '2026-09-01T00:00:00.000Z',
    current_period_end: '2026-10-01T00:00:00.000Z',
    cancel_at_period_end: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    provider: 'manual',
    provider_subscription_id: null,
    provider_customer_id: null,
    source: 'admin_grant',
    granted_by_user_id: null,
    notes: null,
    canceled_at: null,
    ended_at: null,
    ...over
  }
}

function repoFake(over: Partial<SubscriptionRepository> = {}): SubscriptionRepository {
  return {
    listActivePlans: vi.fn(),
    getPlanById: vi.fn(),
    getPlayerSubscription: vi.fn(),
    getPlayerSubscriptionByStripeId: vi.fn(),
    createPlayerSubscription: vi.fn(),
    updatePlayerSubscription: vi.fn(),
    getClubSubscription: vi.fn(),
    findLatestForClub: vi.fn().mockResolvedValue(null),
    getClubSubscriptionByStripeId: vi.fn(),
    createClubSubscription: vi.fn(),
    updateClubSubscription: vi.fn(),
    listClubSubscriptions: vi.fn().mockResolvedValue([]),
    findLapsedCandidates: vi.fn().mockResolvedValue([]),
    findClubSubscriptionById: vi.fn().mockResolvedValue(null),
    listPublicClubPlans: vi.fn().mockResolvedValue([]),
    listPlansForAdmin: vi.fn().mockResolvedValue([]),
    getClubPlanById: vi.fn().mockResolvedValue(null),
    getPlansByIds: vi.fn().mockResolvedValue([]),
    getDefaultFreePlan: vi.fn().mockResolvedValue(freePlanRecord()),
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    ...over
  } as SubscriptionRepository
}

function serviceWith(sub: ClubSubscriptionRecord | null, plan = planRecord(), graceDays = 7) {
  const repo = repoFake({
    findLatestForClub: vi.fn().mockResolvedValue(sub),
    getClubPlanById: vi.fn().mockResolvedValue(plan)
  })
  return { repo, service: createClubEntitlementsService(repo, { graceDays, now }) }
}

describe('resolve — which statuses entitle', () => {
  it('an active subscription gets its plan', async () => {
    const { service } = serviceWith(subRecord({ status: 'active' }))
    const ent = await service.resolve('club-1')
    expect(ent.origin).toBe('plan')
    expect(ent.plan_name).toBe('Premium')
    expect(ent.max_live_tournaments).toBeNull()
  })

  it('a TRIALING club gets its plan, not the free tier', async () => {
    // This is a live bug being fixed: subscription.service.ts requires
    // status === 'active', so a club in a trial silently got free-tier features
    // while the UI showed it a paid plan.
    const { service } = serviceWith(subRecord({ status: 'trialing' }))
    const ent = await service.resolve('club-1')
    expect(ent.origin).toBe('plan')
    expect(ent.plan_name).toBe('Premium')
  })

  it('a paused subscription drops to the default plan', async () => {
    const { service } = serviceWith(subRecord({ status: 'paused' }))
    expect((await service.resolve('club-1')).origin).toBe('default_plan')
  })

  it('an incomplete subscription drops to the default plan', async () => {
    const { service } = serviceWith(subRecord({ status: 'incomplete' }))
    expect((await service.resolve('club-1')).origin).toBe('default_plan')
  })
})

describe('resolve — a cancelled club keeps the month it paid for', () => {
  it('honours a cancellation whose period has not ended', async () => {
    // They paid for this month; cancelling is a decision about the next one.
    const { service } = serviceWith(
      subRecord({ status: 'canceled', current_period_end: '2026-10-01T00:00:00.000Z' })
    )
    const ent = await service.resolve('club-1')
    expect(ent.origin).toBe('plan')
    expect(ent.status).toBe('canceled')
  })

  it('drops to default once the paid period has ended', async () => {
    const { service } = serviceWith(
      subRecord({ status: 'canceled', current_period_end: '2026-09-01T00:00:00.000Z' })
    )
    expect((await service.resolve('club-1')).origin).toBe('default_plan')
  })

  it('treats a cancellation with no period end as immediate', async () => {
    const { service } = serviceWith(subRecord({ status: 'canceled', current_period_end: null }))
    expect((await service.resolve('club-1')).origin).toBe('default_plan')
  })

  it('reads the cancelled row at all only because findLatestForClub does not filter', async () => {
    // getClubSubscription filters to the live statuses and would return null
    // here, so this case is the reason that repository change is load-bearing.
    const { service, repo } = serviceWith(
      subRecord({ status: 'canceled', current_period_end: '2026-10-01T00:00:00.000Z' })
    )
    await service.resolve('club-1')
    expect(repo.findLatestForClub).toHaveBeenCalledWith('club-1')
    expect(repo.getClubSubscription).not.toHaveBeenCalled()
  })
})

describe('resolve — past_due and the grace window', () => {
  it('keeps working while the period is still running', async () => {
    // A failed card is not a decision to leave.
    const { service } = serviceWith(
      subRecord({ status: 'past_due', current_period_end: '2026-10-01T00:00:00.000Z' })
    )
    const ent = await service.resolve('club-1')
    expect(ent.origin).toBe('plan')
    expect(ent.in_grace).toBe(false)
  })

  it('keeps working inside the grace window, and says so', async () => {
    // Ended 2026-09-10, 7-day grace, now is the 15th.
    const { service } = serviceWith(
      subRecord({ status: 'past_due', current_period_end: '2026-09-10T00:00:00.000Z' })
    )
    const ent = await service.resolve('club-1')
    expect(ent.origin).toBe('plan')
    expect(ent.in_grace).toBe(true)
  })

  it('drops to default once the grace window closes', async () => {
    // Ended 2026-09-01, 7 days runs out on the 8th, now is the 15th.
    const { service } = serviceWith(
      subRecord({ status: 'past_due', current_period_end: '2026-09-01T00:00:00.000Z' })
    )
    expect((await service.resolve('club-1')).origin).toBe('default_plan')
  })

  it('honours a grace window of zero days', async () => {
    const { service } = serviceWith(
      subRecord({ status: 'past_due', current_period_end: '2026-09-10T00:00:00.000Z' }),
      planRecord(),
      0
    )
    expect((await service.resolve('club-1')).origin).toBe('default_plan')
  })
})

describe('resolve — falling back', () => {
  it('uses the default plan when the club has no subscription at all', async () => {
    const { service } = serviceWith(null)
    const ent = await service.resolve('club-1')
    expect(ent.origin).toBe('default_plan')
    expect(ent.plan_name).toBe('Free')
    expect(ent.status).toBeNull()
    // The 0009 seed, which is the 1/1/1 event.service.ts already enforced.
    expect(ent.max_draft_events).toBe(1)
    expect(ent.max_live_tournaments).toBe(1)
    expect(ent.max_live_open_play).toBe(1)
    expect(ent.max_members).toBeNull()
  })

  it('does not hand out a free upgrade when a subscription points at a missing plan', async () => {
    const repo = repoFake({
      findLatestForClub: vi.fn().mockResolvedValue(subRecord({ status: 'active' })),
      getClubPlanById: vi.fn().mockResolvedValue(null)
    })
    const service = createClubEntitlementsService(repo, { now })
    const ent = await service.resolve('club-1')
    expect(ent.origin).toBe('default_plan')
  })

  it("falls back to TODAY'S BEHAVIOUR when there is no default plan row", async () => {
    // Not unlimited, which would be a silent regression handing every club a
    // free paid tier; and not zero, which would lock clubs out of their own
    // events over a bad read.
    const repo = repoFake({ getDefaultFreePlan: vi.fn().mockResolvedValue(null) })
    const service = createClubEntitlementsService(repo, { now })
    const ent = await service.resolve('club-1')

    expect(ent.origin).toBe('fallback')
    expect(ent.max_draft_events).toBe(SAFE_DEFAULT_ENTITLEMENTS.max_draft_events)
    expect(ent.max_live_tournaments).toBe(1)
    expect(ent.max_live_open_play).toBe(1)
    expect(ent.online_fee_collection).toBe(false)
    expect(ent.verified_badge_eligible).toBe(false)
  })
})

describe('SAFE_DEFAULT_ENTITLEMENTS', () => {
  it('is exactly the allowance the hardcoded literals enforced', async () => {
    // If this ever changes, event.service.ts's degrade path changes what an
    // unwired caller allows — which is the regression this constant exists to
    // prevent.
    expect(SAFE_DEFAULT_ENTITLEMENTS).toEqual({
      max_draft_events: 1,
      max_live_tournaments: 1,
      max_live_open_play: 1,
      max_members: null,
      online_fee_collection: false,
      verified_badge_eligible: false,
      allowed_event_types: null,
      can_create_ranked_events: false
    })
  })
})

describe('resolveMany', () => {
  it('resolves a page of clubs in two queries, not two per club', async () => {
    const repo = repoFake({
      listClubSubscriptions: vi
        .fn()
        .mockResolvedValue([
          subRecord({ id: 's1', club_id: 'club-1', status: 'active' }),
          subRecord({ id: 's2', club_id: 'club-2', status: 'paused' })
        ]),
      getPlansByIds: vi.fn().mockResolvedValue([planRecord()])
    })
    const service = createClubEntitlementsService(repo, { now })

    const result = await service.resolveMany(['club-1', 'club-2', 'club-3'])

    expect(result.get('club-1')?.origin).toBe('plan')
    expect(result.get('club-2')?.origin).toBe('default_plan')
    expect(result.get('club-3')?.origin).toBe('default_plan')

    expect(repo.listClubSubscriptions).toHaveBeenCalledTimes(1)
    expect(repo.getPlansByIds).toHaveBeenCalledTimes(1)
    // The N+1 shape this exists to avoid.
    expect(repo.findLatestForClub).not.toHaveBeenCalled()
    expect(repo.getClubPlanById).not.toHaveBeenCalled()
  })

  it('takes the newest row when a club has several', async () => {
    const repo = repoFake({
      listClubSubscriptions: vi.fn().mockResolvedValue([
        // The repository orders newest first, so this is the live one.
        subRecord({ id: 'new', club_id: 'club-1', status: 'active' }),
        subRecord({ id: 'old', club_id: 'club-1', status: 'canceled', current_period_end: null })
      ]),
      getPlansByIds: vi.fn().mockResolvedValue([planRecord()])
    })
    const service = createClubEntitlementsService(repo, { now })

    expect((await service.resolveMany(['club-1'])).get('club-1')?.origin).toBe('plan')
  })

  it('returns an entry for every club asked about, subscription or not', async () => {
    const repo = repoFake()
    const service = createClubEntitlementsService(repo, { now })
    const result = await service.resolveMany(['a', 'b'])
    expect([...result.keys()]).toEqual(['a', 'b'])
  })

  it('does not query at all for an empty list', async () => {
    const repo = repoFake()
    const service = createClubEntitlementsService(repo, { now })
    expect((await service.resolveMany([])).size).toBe(0)
    expect(repo.listClubSubscriptions).not.toHaveBeenCalled()
  })

  it('agrees with resolve() for the same club', async () => {
    const sub = subRecord({ status: 'trialing' })
    const single = serviceWith(sub)
    const one = await single.service.resolve('club-1')

    const repo = repoFake({
      listClubSubscriptions: vi.fn().mockResolvedValue([sub]),
      getPlansByIds: vi.fn().mockResolvedValue([planRecord()])
    })
    const many = await createClubEntitlementsService(repo, { now }).resolveMany(['club-1'])

    expect(many.get('club-1')).toEqual(one)
  })
})

describe('no caching', () => {
  it('re-reads on every call', async () => {
    // feature-flags.ts earns its 30s cache because a flag is decoration. An
    // entitlement gates a refusal, and a club that has just paid must not be
    // told to wait half a minute for its own event.
    const { service, repo } = serviceWith(subRecord())
    await service.resolve('club-1')
    await service.resolve('club-1')
    expect(repo.findLatestForClub).toHaveBeenCalledTimes(2)
  })
})

describe('every status is handled', () => {
  const statuses: SubscriptionStatus[] = [
    'active',
    'canceled',
    'past_due',
    'trialing',
    'paused',
    'incomplete'
  ]

  it.each(statuses)('resolves a %s subscription without throwing', async (status) => {
    const { service } = serviceWith(subRecord({ status }))
    const ent = await service.resolve('club-1')
    expect(['plan', 'default_plan', 'fallback']).toContain(ent.origin)
  })
})
