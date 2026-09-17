import { describe, it, expect, vi } from 'vitest'
import {
  createClubSubscriptionService,
  ClubSubscriptionServiceError,
  addMonths,
  type BillingEventRepository,
  type ClubSubscriptionServiceDeps
} from '~/server/domains/payment/services/club-subscription.service'
import type { SubscriptionRepository } from '~/server/domains/payment/repositories/subscription.repository'
import type {
  CreateTransactionInput,
  TransactionRepository
} from '~/server/domains/payment/repositories/transaction.repository'
import type { PlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import type { ClubEntitlementsService } from '~/server/domains/payment/services/club-entitlements.service'
import type { ClubVerificationService } from '~/server/domains/club/services/club-verification.service'
import type { ClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import type { ClubRepository } from '~/server/domains/club/repositories/club.repository'
import type {
  ClubPlanRecord,
  ClubSubscriptionRecord
} from '~/server/domains/payment/dto/subscription.dto'
import type { PaymentTransactionRecord } from '~/server/domains/payment/dto/transaction.dto'
import type { EventRecord } from '~/server/domains/event/dto/event.dto'
import type { PaymentGateway } from '~/server/domains/payment/gateways/payment-gateway'
import { createSimulatedGateway } from '~/server/domains/payment/gateways/simulated.gateway'
import { resolvePaymentGateway } from '~/server/domains/payment/gateways'

const NOW = new Date('2026-09-17T08:00:00.000Z')
const now = () => NOW

function plan(over: Partial<ClubPlanRecord> = {}): ClubPlanRecord {
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
    is_public: true,
    is_featured: false,
    is_default_free: false,
    max_draft_events: null,
    max_live_tournaments: null,
    max_live_open_play: null,
    max_members: null,
    online_fee_collection: true,
    verified_badge_eligible: true,
    ...over
  }
}

const FREE = plan({
  id: 'plan-free',
  name: 'Free',
  price_cents: 0,
  is_default_free: true,
  max_draft_events: 1,
  max_live_tournaments: 1,
  max_live_open_play: 1,
  online_fee_collection: false,
  verified_badge_eligible: false
})

function event(over: Partial<EventRecord>): EventRecord {
  return {
    id: 'ev',
    club_id: 'club-1',
    name: 'Event',
    status: 'published',
    event_type: 'tournament',
    start_date: '2026-10-01',
    created_at: '2026-09-01T00:00:00.000Z',
    restricted_at: null,
    restricted_reason: null,
    ...over
  } as EventRecord
}

interface World {
  subs: ClubSubscriptionRecord[]
  txns: PaymentTransactionRecord[]
  events: EventRecord[]
  plans: ClubPlanRecord[]
  billingMode: 'off' | 'simulated' | 'live'
  isSuperAdmin: boolean
  membershipRole: 'OWNER' | 'ADMIN' | 'MEMBER' | null
  verification: { requested: string[]; lapsed: string[] }
  /** What the simulated gateway hands out as provider_reference. Fixed = replay. */
  gatewayRef: (() => string) | null
}

function build(overrides: Partial<World> = {}) {
  const world: World = {
    subs: [],
    txns: [],
    events: [],
    plans: [plan(), FREE],
    billingMode: 'simulated',
    isSuperAdmin: false,
    membershipRole: 'OWNER',
    verification: { requested: [], lapsed: [] },
    gatewayRef: null,
    ...overrides
  }
  let nextId = 1
  let nextRef = 1
  const refs = world.gatewayRef ?? (() => `ref-${nextRef++}`)

  const subscriptions = {
    findLatestForClub: vi.fn(async (clubId: string) => {
      const rows = world.subs.filter((s) => s.club_id === clubId)
      return rows.length ? rows[rows.length - 1] : null
    }),
    findClubSubscriptionById: vi.fn(async (id: string) => world.subs.find((s) => s.id === id) ?? null),
    getClubPlanById: vi.fn(async (id: string) => world.plans.find((p) => p.id === id) ?? null),
    getDefaultFreePlan: vi.fn(async () => FREE),
    listClubSubscriptions: vi.fn(async (filter: { clubId?: string; status?: string[] } = {}) =>
      world.subs.filter(
        (s) =>
          (!filter.clubId || s.club_id === filter.clubId) &&
          (!filter.status || filter.status.includes(s.status))
      )
    ),
    createClubSubscription: vi.fn(async (input: Partial<ClubSubscriptionRecord>) => {
      const row = {
        id: `sub-${nextId++}`,
        stripe_subscription_id: null,
        stripe_customer_id: null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        created_at: NOW.toISOString(),
        updated_at: NOW.toISOString(),
        provider_subscription_id: null,
        provider_customer_id: null,
        granted_by_user_id: null,
        notes: null,
        canceled_at: null,
        ended_at: null,
        ...input
      } as ClubSubscriptionRecord
      world.subs.push(row)
      return row
    }),
    updateClubSubscription: vi.fn(async (id: string, patch: Partial<ClubSubscriptionRecord>) => {
      const i = world.subs.findIndex((s) => s.id === id)
      world.subs[i] = { ...world.subs[i], ...patch }
      return world.subs[i]
    }),
    findLapsedCandidates: vi.fn(async (before: string) =>
      world.subs.filter(
        (s) =>
          s.ended_at === null &&
          s.current_period_end !== null &&
          s.current_period_end < before &&
          ['active', 'trialing', 'past_due', 'canceled'].includes(s.status)
      )
    )
  } as unknown as SubscriptionRepository

  const transactions = {
    create: vi.fn(async (input: CreateTransactionInput) => {
      if (
        world.txns.some(
          (t) => t.provider === input.provider && t.provider_reference === input.provider_reference
        )
      ) {
        throw Object.assign(new Error('duplicate'), { code: '23505' })
      }
      const row = {
        id: `txn-${nextId++}`,
        player_id: null,
        club_id: null,
        stripe_payment_intent_id: null,
        stripe_invoice_id: null,
        currency: 'php',
        description: null,
        metadata: {},
        created_at: NOW.toISOString(),
        updated_at: NOW.toISOString(),
        provider: 'manual',
        provider_reference: null,
        is_test: false,
        subscription_id: null,
        ...input
      } as PaymentTransactionRecord
      world.txns.push(row)
      return row
    }),
    findByProviderReference: vi.fn(async (provider: string, ref: string) =>
      world.txns.find((t) => t.provider === provider && t.provider_reference === ref) ?? null
    ),
    updateSubscription: vi.fn(async (id: string, subscriptionId: string) => {
      const t = world.txns.find((x) => x.id === id)!
      t.subscription_id = subscriptionId
      return t
    }),
    listByClub: vi.fn(async (clubId: string) => world.txns.filter((t) => t.club_id === clubId))
  } as unknown as TransactionRepository

  const platformConfig = {
    getConfig: vi.fn(async () => ({
      id: 'cfg',
      super_admin_id: 'admin',
      billing_mode: world.billingMode,
      billing_notice: null,
      subscription_grace_days: 7
    })),
    updateBilling: vi.fn()
  } as unknown as PlatformConfigRepository

  const events: BillingEventRepository = {
    countByClubForLimits: vi.fn(async () => ({ drafts: 0, liveTournaments: 0, liveOpenPlay: 0 })),
    findRestrictableForClub: vi.fn(async (clubId: string) =>
      world.events
        .filter((e) => e.club_id === clubId && ['draft', 'published', 'active'].includes(e.status))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
    ),
    setRestricted: vi.fn(async (ids: string[], reason: 'plan_downgrade' | null) => {
      let n = 0
      for (const e of world.events) {
        if (ids.includes(e.id)) {
          e.restricted_at = reason ? NOW.toISOString() : null
          e.restricted_reason = reason
          n++
        }
      }
      return n
    })
  }

  const entitlements = {
    resolve: vi.fn(async () => ({
      ...FREE,
      plan_id: FREE.id,
      plan_name: 'Free',
      origin: 'default_plan',
      status: null,
      current_period_end: null,
      in_grace: false
    })),
    resolveMany: vi.fn()
  } as unknown as ClubEntitlementsService

  const verification = {
    requestVerificationFromSubscription: vi.fn(async (clubId: string) => {
      world.verification.requested.push(clubId)
      return true
    }),
    onSubscriptionLapsed: vi.fn(async (clubId: string) => {
      world.verification.lapsed.push(clubId)
    })
  } as unknown as ClubVerificationService

  const memberships = {
    findByClubAndPlayer: vi.fn(async () =>
      world.membershipRole
        ? { id: 'm', club_id: 'club-1', player_id: 'p', role: world.membershipRole, status: 'active' }
        : null
    ),
    listByClub: vi.fn(async () => [])
  } as unknown as ClubMembershipRepository

  const clubs = {
    findById: vi.fn(async (id: string) => ({ id, name: 'Club', verification_status: 'unverified' }))
  } as unknown as ClubRepository

  const deps: ClubSubscriptionServiceDeps = {
    subscriptions,
    transactions,
    platformConfig,
    platformAdmin: { isSuperAdmin: async () => world.isSuperAdmin },
    memberships,
    clubs,
    events,
    entitlements,
    verification
  }

  const service = createClubSubscriptionService(deps, {
    now,
    gateway: (mode): PaymentGateway => {
      if (mode === 'simulated') return createSimulatedGateway(refs)
      // Mirror production behaviour for the other modes.
      return resolvePaymentGateway(mode)
    }
  })

  return { world, service, deps }
}

async function expectError(p: Promise<unknown>, status: number, code: string) {
  try {
    await p
    expect.unreachable('expected a ClubSubscriptionServiceError')
  } catch (err) {
    expect(err).toBeInstanceOf(ClubSubscriptionServiceError)
    expect((err as ClubSubscriptionServiceError).status).toBe(status)
    expect((err as ClubSubscriptionServiceError).code).toBe(code)
  }
}

describe('addMonths', () => {
  it('moves whole calendar months and clamps to the month end', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00.000Z'), 1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z'
    )
    expect(addMonths(new Date('2026-09-17T08:00:00.000Z'), 12).toISOString()).toBe(
      '2027-09-17T08:00:00.000Z'
    )
  })
})

describe('startCheckout', () => {
  it('activates the plan through the simulated gateway and records ₱0, not the list price', async () => {
    const { service, world } = build()
    const result = await service.startCheckout('p', 'club-1', 'plan-premium', 'key-1')

    expect(result.outcome).toBe('activated')
    expect(result.transaction.amount_cents).toBe(0)
    expect(result.transaction.is_test).toBe(true)
    expect(world.txns[0].metadata.list_price_cents).toBe(99900)
    expect(result.subscription.status).toBe('active')
    expect(result.subscription.source).toBe('simulated_checkout')
    expect(result.subscription.current_period_end).toBe('2026-10-17T08:00:00.000Z')
  })

  it('writes the transaction before the subscription and then links them', async () => {
    const { service, deps, world } = build()
    const order: string[] = []
    vi.mocked(deps.transactions.create).mockImplementationOnce(async (input) => {
      order.push('transaction')
      const row = {
        id: 'txn-x',
        ...input,
        subscription_id: null,
        metadata: input.metadata ?? {}
      } as unknown as PaymentTransactionRecord
      world.txns.push(row)
      return row
    })
    vi.mocked(deps.subscriptions.createClubSubscription).mockImplementationOnce(async (input) => {
      order.push('subscription')
      const row = { id: 'sub-x', ...input } as unknown as ClubSubscriptionRecord
      world.subs.push(row)
      return row
    })

    await service.startCheckout('p', 'club-1', 'plan-premium', 'key-1')
    expect(order).toEqual(['transaction', 'subscription'])
    expect(deps.transactions.updateSubscription).toHaveBeenCalledWith('txn-x', 'sub-x')
  })

  it('clears held events and queues the club for verification on an eligible plan', async () => {
    const { service, world, deps } = build({
      events: [event({ id: 'held', restricted_at: 'x', restricted_reason: 'plan_downgrade' })]
    })
    const result = await service.startCheckout('p', 'club-1', 'plan-premium', 'key-1')
    expect(deps.events.setRestricted).toHaveBeenCalledWith(['held'], null)
    expect(world.events[0].restricted_at).toBeNull()
    expect(result.verification_requested).toBe(true)
    expect(world.verification.requested).toEqual(['club-1'])
  })

  it('does not queue verification for a plan that is not badge-eligible', async () => {
    const { service, world } = build({
      plans: [plan({ verified_badge_eligible: false }), FREE]
    })
    const result = await service.startCheckout('p', 'club-1', 'plan-premium', 'key-1')
    expect(result.verification_requested).toBe(false)
    expect(world.verification.requested).toEqual([])
  })

  it('closes the previous live row rather than tripping the one-live index', async () => {
    const { service, world } = build()
    await service.startCheckout('p', 'club-1', 'plan-premium', 'key-1')
    await service.startCheckout('p', 'club-1', 'plan-premium', 'key-2')
    const live = world.subs.filter((s) => s.status === 'active')
    expect(live).toHaveLength(1)
    expect(world.subs[0].status).toBe('canceled')
    expect(world.subs[0].ended_at).toBe(NOW.toISOString())
  })

  it('returns the existing state when the same provider reference is replayed', async () => {
    const { service } = build({ gatewayRef: () => 'fixed' })
    const first = await service.startCheckout('p', 'club-1', 'plan-premium', 'key-1')
    const replay = await service.startCheckout('p', 'club-1', 'plan-premium', 'key-1')
    expect(replay.outcome).toBe('already_processed')
    expect(replay.transaction.id).toBe(first.transaction.id)
  })

  it('refuses any voucher code, because vouchers do not exist yet', async () => {
    const { service } = build()
    await expectError(
      service.startCheckout('p', 'club-1', 'plan-premium', 'key-1', 'SAVE10'),
      400,
      'VOUCHER_UNKNOWN'
    )
  })

  it('treats a blank voucher as no voucher', async () => {
    const { service } = build()
    const result = await service.startCheckout('p', 'club-1', 'plan-premium', 'key-1', '   ')
    expect(result.outcome).toBe('activated')
  })

  it('refuses when billing is off', async () => {
    const { service } = build({ billingMode: 'off' })
    await expectError(
      service.startCheckout('p', 'club-1', 'plan-premium', 'key-1'),
      503,
      'BILLING_DISABLED'
    )
  })

  it('refuses live mode with 501 rather than falling back to the simulated gateway', async () => {
    const { service, world } = build({ billingMode: 'live' })
    await expectError(
      service.startCheckout('p', 'club-1', 'plan-premium', 'key-1'),
      501,
      'GATEWAY_NOT_CONFIGURED'
    )
    expect(world.subs).toHaveLength(0)
    expect(world.txns).toHaveLength(0)
  })

  it('refuses the default free plan', async () => {
    const { service } = build()
    await expectError(service.startCheckout('p', 'club-1', 'plan-free', 'key-1'), 409, 'PLAN_IS_FREE')
  })

  it('refuses an inactive plan', async () => {
    const { service } = build({ plans: [plan({ is_active: false }), FREE] })
    await expectError(
      service.startCheckout('p', 'club-1', 'plan-premium', 'key-1'),
      409,
      'PLAN_UNAVAILABLE'
    )
  })

  it('refuses a plain member', async () => {
    const { service } = build({ membershipRole: 'MEMBER' })
    await expectError(service.startCheckout('p', 'club-1', 'plan-premium', 'key-1'), 403, 'FORBIDDEN')
  })
})

describe('cancel', () => {
  it('cancels at period end and keeps the paid period', async () => {
    const { service, world } = build()
    await service.startCheckout('p', 'club-1', 'plan-premium', 'key-1')
    const billing = await service.cancel('p', 'club-1')
    const sub = world.subs[0]
    expect(sub.status).toBe('canceled')
    expect(sub.cancel_at_period_end).toBe(true)
    expect(sub.current_period_end).toBe('2026-10-17T08:00:00.000Z')
    expect(sub.ended_at).toBeNull()
    expect(billing.subscription?.canceled_at).toBe(NOW.toISOString())
  })

  it('does not restrict anything or touch verification — that waits for the lapse sweep', async () => {
    const { service, deps, world } = build()
    await service.startCheckout('p', 'club-1', 'plan-premium', 'key-1')
    vi.mocked(deps.events.setRestricted).mockClear()
    await service.cancel('p', 'club-1')
    expect(deps.events.setRestricted).not.toHaveBeenCalled()
    expect(world.verification.lapsed).toEqual([])
  })

  it('refuses when there is nothing to cancel', async () => {
    const { service } = build()
    await expectError(service.cancel('p', 'club-1'), 409, 'NO_ACTIVE_SUBSCRIPTION')
  })
})

describe('SuperAdmin grant / extend / adminCancel', () => {
  it('grant records provenance and the granting admin', async () => {
    const { service, world } = build({ isSuperAdmin: true })
    const row = await service.grant('admin-1', 'club-1', 'plan-premium', 3, 'Pilot club')
    expect(row.subscription.source).toBe('admin_grant')
    expect(row.subscription.provider).toBe('manual')
    expect(world.subs[0].granted_by_user_id).toBe('admin-1')
    expect(world.subs[0].notes).toBe('Pilot club')
    expect(row.subscription.current_period_end).toBe('2026-12-17T08:00:00.000Z')
    expect(world.verification.requested).toEqual(['club-1'])
  })

  it('grant writes no transaction — nothing was paid', async () => {
    const { service, world } = build({ isSuperAdmin: true })
    await service.grant('admin-1', 'club-1', 'plan-premium', 1)
    expect(world.txns).toHaveLength(0)
  })

  it('grant refuses a non-admin and a silly month count', async () => {
    const { service } = build({ isSuperAdmin: false })
    await expectError(service.grant('u', 'club-1', 'plan-premium', 1), 403, 'FORBIDDEN')
    const admin = build({ isSuperAdmin: true })
    await expectError(admin.service.grant('a', 'club-1', 'plan-premium', 0), 400, 'VALIDATION_ERROR')
    await expectError(admin.service.grant('a', 'club-1', 'plan-premium', 37), 400, 'VALIDATION_ERROR')
  })

  it('extend pushes the period end forward from where it was', async () => {
    const { service, world } = build({ isSuperAdmin: true })
    const granted = await service.grant('admin-1', 'club-1', 'plan-premium', 1)
    const extended = await service.extend('admin-1', granted.subscription.id, 2)
    expect(extended.subscription.current_period_end).toBe('2026-12-17T08:00:00.000Z')
    expect(world.subs[0].status).toBe('active')
  })

  it('extend revives a cancel-at-period-end', async () => {
    const { service, world } = build({ isSuperAdmin: true })
    const granted = await service.grant('admin-1', 'club-1', 'plan-premium', 1)
    await service.cancel('p', 'club-1')
    await service.extend('admin-1', granted.subscription.id, 1)
    expect(world.subs[0].status).toBe('active')
    expect(world.subs[0].cancel_at_period_end).toBe(false)
    expect(world.subs[0].canceled_at).toBeNull()
  })

  it('adminCancel is immediate: restricts events and revokes a subscription badge', async () => {
    const { service, world } = build({
      isSuperAdmin: true,
      events: [
        event({ id: 'old', start_date: '2026-10-01' }),
        event({ id: 'new', start_date: '2026-11-01' })
      ]
    })
    const granted = await service.grant('admin-1', 'club-1', 'plan-premium', 1)
    const row = await service.adminCancel('admin-1', granted.subscription.id, 'Test lapse')
    expect(row.subscription.status).toBe('canceled')
    expect(row.subscription.ended_at).toBe(NOW.toISOString())
    expect(row.subscription.current_period_end).toBe(NOW.toISOString())
    expect(world.events.find((e) => e.id === 'old')!.restricted_at).toBeNull()
    expect(world.events.find((e) => e.id === 'new')!.restricted_at).toBe(NOW.toISOString())
    expect(world.verification.lapsed).toEqual(['club-1'])
  })

  it('adminCancel refuses a subscription that already ended', async () => {
    const { service } = build({ isSuperAdmin: true })
    const granted = await service.grant('admin-1', 'club-1', 'plan-premium', 1)
    await service.adminCancel('admin-1', granted.subscription.id)
    await expectError(
      service.adminCancel('admin-1', granted.subscription.id),
      409,
      'SUBSCRIPTION_ENDED'
    )
  })
})

describe('downgrade restrictions', () => {
  it('keeps the oldest unfinished event of EACH type and restricts the rest', async () => {
    const { service, world } = build({
      events: [
        event({ id: 't2', event_type: 'tournament', start_date: '2026-11-01' }),
        event({ id: 't1', event_type: 'tournament', start_date: '2026-10-01' }),
        event({ id: 'o1', event_type: 'open_casual', start_date: '2026-10-05' }),
        event({ id: 'o2', event_type: 'club_ranked', start_date: '2026-10-06' }),
        event({ id: 'd1', status: 'draft', start_date: '2026-12-01' }),
        event({ id: 'd2', status: 'draft', start_date: '2026-12-02' })
      ]
    })
    const n = await service.applyDowngradeRestrictions('club-1')
    expect(n).toBe(3)
    const restricted = world.events.filter((e) => e.restricted_at).map((e) => e.id).sort()
    expect(restricted).toEqual(['d2', 'o2', 't2'])
  })

  it('breaks a start_date tie by created_at', async () => {
    const { service, world } = build({
      events: [
        event({ id: 'later', start_date: '2026-10-01', created_at: '2026-09-02T00:00:00.000Z' }),
        event({ id: 'first', start_date: '2026-10-01', created_at: '2026-09-01T00:00:00.000Z' })
      ]
    })
    await service.applyDowngradeRestrictions('club-1')
    expect(world.events.find((e) => e.id === 'first')!.restricted_at).toBeNull()
    expect(world.events.find((e) => e.id === 'later')!.restricted_at).not.toBeNull()
  })

  it('leaves completed and cancelled events alone', async () => {
    const { service, deps } = build({
      events: [
        event({ id: 'live', start_date: '2026-10-01' }),
        event({ id: 'done', status: 'completed', start_date: '2026-08-01' }),
        event({ id: 'gone', status: 'cancelled', start_date: '2026-08-02' }),
        event({ id: 'extra', start_date: '2026-11-01' })
      ]
    })
    await service.applyDowngradeRestrictions('club-1')
    expect(deps.events.setRestricted).toHaveBeenCalledWith(['extra'], 'plan_downgrade')
  })

  it('is idempotent — an already-restricted event is not restricted again', async () => {
    const { service, deps } = build({
      events: [
        event({ id: 'keep', start_date: '2026-10-01' }),
        event({ id: 'held', start_date: '2026-11-01', restricted_at: 'x', restricted_reason: 'plan_downgrade' })
      ]
    })
    await service.applyDowngradeRestrictions('club-1')
    expect(deps.events.setRestricted).toHaveBeenCalledWith([], 'plan_downgrade')
  })

  it('resubscribing clears every held event in one call', async () => {
    const { service, deps, world } = build({
      events: [
        event({ id: 'a', restricted_at: 'x', restricted_reason: 'plan_downgrade' }),
        event({ id: 'b', restricted_at: 'x', restricted_reason: 'plan_downgrade' }),
        event({ id: 'c' })
      ]
    })
    const n = await service.clearDowngradeRestrictions('club-1')
    expect(n).toBe(2)
    expect(deps.events.setRestricted).toHaveBeenCalledWith(['a', 'b'], null)
    expect(world.events.every((e) => e.restricted_at === null)).toBe(true)
  })

  it('never writes an event status', async () => {
    const { service, world } = build({
      events: [event({ id: 'a', start_date: '2026-10-01' }), event({ id: 'b', start_date: '2026-11-01' })]
    })
    await service.applyDowngradeRestrictions('club-1')
    expect(world.events.map((e) => e.status)).toEqual(['published', 'published'])
  })
})

describe('sweepLapsed', () => {
  function sub(over: Partial<ClubSubscriptionRecord>): ClubSubscriptionRecord {
    return {
      id: 's',
      club_id: 'club-1',
      plan_id: 'plan-premium',
      stripe_subscription_id: null,
      stripe_customer_id: null,
      status: 'active',
      current_period_start: '2026-08-01T00:00:00.000Z',
      current_period_end: '2026-09-01T00:00:00.000Z',
      cancel_at_period_end: false,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
      provider: 'manual',
      provider_subscription_id: null,
      provider_customer_id: null,
      source: 'admin_grant',
      granted_by_user_id: 'admin',
      notes: null,
      canceled_at: null,
      ended_at: null,
      ...over
    }
  }

  it('closes an active grant whose period has run out', async () => {
    const { service, world } = build({
      subs: [sub({ id: 'expired' })],
      events: [event({ id: 'a', start_date: '2026-10-01' }), event({ id: 'b', start_date: '2026-11-01' })]
    })
    const result = await service.sweepLapsed()
    expect(result.lapsed).toEqual(['expired'])
    expect(result.restricted).toBe(1)
    expect(world.subs[0].status).toBe('canceled')
    expect(world.subs[0].ended_at).toBe(NOW.toISOString())
    expect(world.verification.lapsed).toEqual(['club-1'])
  })

  it('closes a cancel-at-period-end once the period ends', async () => {
    const { service, world } = build({
      subs: [sub({ id: 'c', status: 'canceled', canceled_at: '2026-08-15T00:00:00.000Z' })]
    })
    await service.sweepLapsed()
    expect(world.subs[0].ended_at).toBe(NOW.toISOString())
    // The original cancellation time is kept.
    expect(world.subs[0].canceled_at).toBe('2026-08-15T00:00:00.000Z')
  })

  it('leaves past_due alone inside the grace window', async () => {
    const { service, world } = build({
      subs: [sub({ id: 'pd', status: 'past_due', current_period_end: '2026-09-12T00:00:00.000Z' })]
    })
    const result = await service.sweepLapsed()
    expect(result.lapsed).toEqual([])
    expect(world.subs[0].ended_at).toBeNull()
  })

  it('closes past_due once grace has run out', async () => {
    const { service } = build({
      subs: [sub({ id: 'pd', status: 'past_due', current_period_end: '2026-09-01T00:00:00.000Z' })]
    })
    const result = await service.sweepLapsed()
    expect(result.lapsed).toEqual(['pd'])
  })

  it('never reads a row it already closed', async () => {
    const { service, world } = build({ subs: [sub({ id: 'x' })] })
    await service.sweepLapsed()
    world.verification.lapsed = []
    const again = await service.sweepLapsed()
    expect(again.lapsed).toEqual([])
    expect(world.verification.lapsed).toEqual([])
  })

  it('does not touch a subscription still inside its period', async () => {
    const { service, world } = build({
      subs: [sub({ id: 'ok', current_period_end: '2026-10-01T00:00:00.000Z' })]
    })
    await service.sweepLapsed()
    expect(world.subs[0].ended_at).toBeNull()
  })
})

describe('getForClub', () => {
  it('assembles the billing page in one call', async () => {
    const { service } = build({
      events: [event({ id: 'held', restricted_at: 'x', restricted_reason: 'plan_downgrade' })]
    })
    await service.startCheckout('p', 'club-1', 'plan-premium', 'key-1')
    const billing = await service.getForClub('p', 'club-1')
    expect(billing.subscription?.status).toBe('active')
    expect(billing.plan?.name).toBe('Premium')
    expect(billing.billing.mode).toBe('simulated')
    expect(billing.transactions).toHaveLength(1)
    expect(billing.transactions[0].is_test).toBe(true)
    // Activation cleared the hold.
    expect(billing.restricted_events).toEqual([])
    expect(billing.usage).toEqual({ drafts: 0, live_tournaments: 0, live_open_play: 0, members: 0 })
  })

  it('is admin-only', async () => {
    const { service } = build({ membershipRole: 'MEMBER' })
    await expectError(service.getForClub('p', 'club-1'), 403, 'FORBIDDEN')
  })
})
