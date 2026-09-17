import { describe, it, expect, vi } from 'vitest'
import {
  createSubscriptionPlanAdminService,
  SubscriptionPlanAdminServiceError
} from '~/server/domains/payment/services/subscription-plan-admin.service'
import type { SubscriptionRepository } from '~/server/domains/payment/repositories/subscription.repository'
import type { PlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import type { ClubPlanRecord } from '~/server/domains/payment/dto/subscription.dto'

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
    is_active: false,
    sort_order: 10,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
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
    ...over
  }
}

const FREE = plan({
  id: 'plan-free',
  name: 'Free',
  price_cents: 0,
  is_active: true,
  is_public: true,
  is_default_free: true,
  plan_group: 'club-free',
  max_draft_events: 1,
  max_live_tournaments: 1,
  max_live_open_play: 1,
  online_fee_collection: false,
  verified_badge_eligible: false
})

function build(plans: ClubPlanRecord[] = [FREE, plan()], isSuperAdmin = true) {
  const store = [...plans]
  const repo = {
    listPlansForAdmin: vi.fn(async () => store),
    getClubPlanById: vi.fn(async (id: string) => store.find((p) => p.id === id) ?? null),
    createPlan: vi.fn(async (input: Partial<ClubPlanRecord>) => {
      const row = plan({ id: `plan-${store.length + 1}`, ...input })
      store.push(row)
      return row
    }),
    updatePlan: vi.fn(async (id: string, input: Partial<ClubPlanRecord>) => {
      const i = store.findIndex((p) => p.id === id)
      store[i] = { ...store[i], ...input }
      return store[i]
    })
  } as unknown as SubscriptionRepository

  let config = {
    id: 'cfg',
    super_admin_id: 'admin',
    billing_mode: 'simulated' as const,
    billing_notice: null as string | null,
    subscription_grace_days: 7
  }
  const platformConfig = {
    getConfig: vi.fn(async () => config),
    updateBilling: vi.fn(async (patch) => {
      config = { ...config, ...patch }
      return config
    })
  } as unknown as PlatformConfigRepository

  const service = createSubscriptionPlanAdminService(
    repo,
    { isSuperAdmin: async () => isSuperAdmin },
    platformConfig
  )
  return { service, repo, store, platformConfig }
}

async function expectRefusal(p: Promise<unknown>, fragment: string, status = 400) {
  try {
    await p
    expect.unreachable('expected a refusal')
  } catch (err) {
    expect(err).toBeInstanceOf(SubscriptionPlanAdminServiceError)
    expect((err as SubscriptionPlanAdminServiceError).status).toBe(status)
    expect((err as SubscriptionPlanAdminServiceError).message).toContain(fragment)
  }
}

describe('plans', () => {
  it('lists every club plan, published or not', async () => {
    const { service } = build()
    const plans = await service.listPlans('admin')
    expect(plans.map((p) => p.name)).toEqual(['Free', 'Premium'])
    expect(plans[1].is_public).toBe(false)
  })

  it('refuses a non-admin', async () => {
    const { service } = build(undefined, false)
    await expectRefusal(service.listPlans('u'), 'super admin', 403)
  })

  it('creates a plan unpublished and forced to club type', async () => {
    const { service, repo } = build()
    const result = await service.createPlan('admin', {
      name: '  Starter ',
      billing_interval: 'month',
      price_cents: 49900
    })
    expect(result.plan.name).toBe('Starter')
    expect(vi.mocked(repo.createPlan).mock.calls[0][0]).toMatchObject({
      plan_type: 'club',
      name: 'Starter'
    })
    expect(result.plan.is_public).toBe(false)
  })

  it('publishing Premium with a price is one update', async () => {
    const { service, store } = build()
    const result = await service.updatePlan('admin', 'plan-premium', {
      price_cents: 79900,
      is_active: true,
      is_public: true
    })
    expect(result.plan.is_public).toBe(true)
    expect(store[1].price_cents).toBe(79900)
  })

  it('the Unlimited checkbox arrives as null and stays null', async () => {
    const { service, repo } = build()
    await service.updatePlan('admin', 'plan-premium', { max_draft_events: null })
    expect(vi.mocked(repo.updatePlan).mock.calls[0][1]).toEqual({ max_draft_events: null })
  })

  it('refuses a negative or fractional limit', async () => {
    const { service } = build()
    await expectRefusal(service.updatePlan('admin', 'plan-premium', { max_members: -1 }), 'whole number')
    await expectRefusal(service.updatePlan('admin', 'plan-premium', { max_members: 1.5 }), 'whole number')
  })

  it('refuses a one-time interval on a club plan', async () => {
    const { service } = build()
    await expectRefusal(
      service.updatePlan('admin', 'plan-premium', { billing_interval: 'one_time' as never }),
      'one-time'
    )
  })

  it('refuses a price on the default free plan', async () => {
    const { service } = build()
    await expectRefusal(service.updatePlan('admin', 'plan-free', { price_cents: 100 }), 'cannot have a price')
  })

  it('refuses verified-badge eligibility on the default free plan', async () => {
    const { service } = build()
    await expectRefusal(
      service.updatePlan('admin', 'plan-free', { verified_badge_eligible: true }),
      'every club on the platform'
    )
  })

  it('refuses deactivating or hiding the default free plan', async () => {
    const { service } = build()
    await expectRefusal(service.updatePlan('admin', 'plan-free', { is_active: false }), 'cannot be deactivated')
    await expectRefusal(service.updatePlan('admin', 'plan-free', { is_public: false }), 'keep it public')
  })

  it('a PATCH does not null out untouched fields', async () => {
    const { service, repo } = build()
    await service.updatePlan('admin', 'plan-premium', { tagline: 'Run everything' })
    expect(vi.mocked(repo.updatePlan).mock.calls[0][1]).toEqual({ tagline: 'Run everything' })
  })

  it('trims copy and drops empty bullets and figures', async () => {
    const { service, repo } = build()
    await service.updatePlan('admin', 'plan-premium', {
      tagline: '   ',
      marketing_bullets: [' Unlimited events ', '', '  '],
      headline_figures: [
        { value: ' ∞ ', label: ' events ' },
        { value: '', label: 'nothing' }
      ]
    })
    expect(vi.mocked(repo.updatePlan).mock.calls[0][1]).toEqual({
      tagline: null,
      marketing_bullets: ['Unlimited events'],
      headline_figures: [{ value: '∞', label: 'events' }]
    })
  })

  it('warns, not refuses, about a public priced plan with no group', async () => {
    const { service } = build()
    const result = await service.updatePlan('admin', 'plan-premium', {
      is_public: true,
      plan_group: null
    })
    expect(result.warnings.some((w) => w.includes('plan group'))).toBe(true)
  })

  it('warns about a yearly plan with no monthly sibling', async () => {
    const { service } = build()
    const result = await service.createPlan('admin', {
      name: 'Premium yearly',
      billing_interval: 'year',
      price_cents: 999000,
      plan_group: 'lonely'
    })
    expect(result.warnings.some((w) => w.includes('monthly sibling'))).toBe(true)
  })

  it('404s on an unknown plan', async () => {
    const { service } = build()
    await expectRefusal(service.updatePlan('admin', 'nope', { name: 'x' }), 'not found', 404)
  })
})

describe('billing settings', () => {
  it('reads the current mode, notice and grace', async () => {
    const { service } = build()
    expect(await service.getBilling('admin')).toEqual({
      billing_mode: 'simulated',
      billing_notice: null,
      subscription_grace_days: 7
    })
  })

  it('switches between off and simulated', async () => {
    const { service } = build()
    expect((await service.updateBilling('admin', { billing_mode: 'off' })).billing_mode).toBe('off')
    expect((await service.updateBilling('admin', { billing_mode: 'simulated' })).billing_mode).toBe(
      'simulated'
    )
  })

  it('refuses live with 501 even from a well-formed request', async () => {
    const { service, platformConfig } = build()
    await expectRefusal(service.updateBilling('admin', { billing_mode: 'live' }), 'ADR-006', 501)
    expect(platformConfig.updateBilling).not.toHaveBeenCalled()
  })

  it('bounds grace days and trims the notice', async () => {
    const { service } = build()
    await expectRefusal(service.updateBilling('admin', { subscription_grace_days: 91 }), '0 to 90')
    const saved = await service.updateBilling('admin', {
      billing_notice: '  Nothing is charged.  ',
      subscription_grace_days: 0
    })
    expect(saved.billing_notice).toBe('Nothing is charged.')
    expect(saved.subscription_grace_days).toBe(0)
  })
})
