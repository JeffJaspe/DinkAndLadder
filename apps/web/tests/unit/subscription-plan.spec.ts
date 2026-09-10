import { describe, it, expect } from 'vitest'
import {
  describeAnnualSaving,
  describeEntitlements,
  describeLimit,
  formatPlanPrice,
  groupPlans,
  isUnlimited,
  perMonthEquivalent
} from '~/utils/subscription-plan'
import type { ClubSubscriptionPlanDto } from '~/server/domains/payment/dto/subscription.dto'

function plan(over: Partial<ClubSubscriptionPlanDto> = {}): ClubSubscriptionPlanDto {
  return {
    id: 'plan-1',
    name: 'Premium',
    description: null,
    billing_interval: 'month',
    price_cents: 99900,
    currency: 'php',
    plan_group: 'club-premium',
    is_featured: false,
    is_default_free: false,
    tagline: null,
    marketing_bullets: [],
    headline_figures: [],
    badge_label: null,
    cta_label: null,
    savings_label: null,
    entitlements: {
      max_draft_events: null,
      max_live_tournaments: null,
      max_live_open_play: null,
      max_members: null,
      online_fee_collection: true,
      verified_badge_eligible: true
    },
    ...over
  }
}

describe('isUnlimited', () => {
  it('is null, and only null', () => {
    expect(isUnlimited(null)).toBe(true)
    expect(isUnlimited(0)).toBe(false)
    // The old jsonb convention. If this ever passes, the -1 disease is back.
    expect(isUnlimited(-1)).toBe(false)
  })
})

describe('describeLimit', () => {
  it('singularises one', () => {
    expect(describeLimit(1, 'draft event')).toBe('1 draft event')
  })

  it('pluralises more than one', () => {
    expect(describeLimit(3, 'draft event')).toBe('3 draft events')
  })

  it('says unlimited for null', () => {
    expect(describeLimit(null, 'member')).toBe('Unlimited members')
  })

  it('says none for zero, never "0"', () => {
    // Zero is a real limit — a plan that allows none of something — and is not
    // the same as unlimited. Confusing the two is what -1-in-jsonb invited.
    expect(describeLimit(0, 'tournament')).toBe('No tournaments')
  })

  it('takes an irregular plural', () => {
    expect(describeLimit(2, 'entry', 'entries')).toBe('2 entries')
  })
})

describe('formatPlanPrice', () => {
  it('says Free for zero rather than a currency-formatted nothing', () => {
    expect(formatPlanPrice(0)).toBe('Free')
    expect(formatPlanPrice(0, 'php', { freeLabel: 'No charge' })).toBe('No charge')
  })

  it('formats pesos from cents', () => {
    expect(formatPlanPrice(99900)).toContain('999')
  })

  it('does not divide a zero-decimal currency by 100', () => {
    // JPY has no minor unit: 5000 yen is 5000, not 50.00.
    const yen = formatPlanPrice(5000, 'jpy')
    expect(yen).toContain('5,000')
  })

  it('survives an unknown currency code instead of taking the page down', () => {
    // Intl accepts any well-formed 3-letter code and formats it with a
    // NON-BREAKING space, so this asserts on the parts rather than on the
    // exact separator. Only a malformed code reaches the catch.
    const formatted = formatPlanPrice(12345, 'zzz')
    expect(formatted).toContain('ZZZ')
    expect(formatted).toContain('123.45')
  })

  it('falls back rather than throwing on a malformed currency code', () => {
    expect(formatPlanPrice(12345, 'not-a-currency')).toBe('NOT-A-CURRENCY 123.45')
  })
})

describe('perMonthEquivalent', () => {
  it('divides a yearly price by twelve', () => {
    expect(perMonthEquivalent(120000, 'year')).toBe(10000)
  })

  it('is null for anything not yearly', () => {
    expect(perMonthEquivalent(99900, 'month')).toBeNull()
    expect(perMonthEquivalent(99900, 'one_time')).toBeNull()
  })

  it('rounds rather than leaving a fraction of a cent', () => {
    expect(Number.isInteger(perMonthEquivalent(100000, 'year'))).toBe(true)
  })
})

describe('describeAnnualSaving', () => {
  it('computes the saving against twelve monthly payments', () => {
    const saving = describeAnnualSaving({ price_cents: 100000 }, { price_cents: 1000000 })
    expect(saving).not.toBeNull()
    expect(saving!.monthlyTotalCents).toBe(1200000)
    expect(saving!.savingCents).toBe(200000)
    expect(saving!.savingPercent).toBe(17)
    expect(saving!.label).toContain('17%')
  })

  it('is null when there is no monthly twin', () => {
    // A yearly plan with nothing to compare against advertises no saving
    // rather than a made-up one.
    expect(describeAnnualSaving(null, { price_cents: 1000000 })).toBeNull()
    expect(describeAnnualSaving(undefined, { price_cents: 1000000 })).toBeNull()
  })

  it('is null when there is no yearly plan', () => {
    expect(describeAnnualSaving({ price_cents: 100000 }, null)).toBeNull()
  })

  it('refuses to dress a more expensive year up as a discount', () => {
    expect(describeAnnualSaving({ price_cents: 100000 }, { price_cents: 1300000 })).toBeNull()
  })

  it('is null when the two prices are identical', () => {
    expect(describeAnnualSaving({ price_cents: 100000 }, { price_cents: 1200000 })).toBeNull()
  })

  it('is null when either price is zero', () => {
    // A free plan has no annual saving to advertise.
    expect(describeAnnualSaving({ price_cents: 0 }, { price_cents: 1000000 })).toBeNull()
    expect(describeAnnualSaving({ price_cents: 100000 }, { price_cents: 0 })).toBeNull()
  })
})

describe('groupPlans', () => {
  it('pairs a monthly plan with its yearly twin', () => {
    const monthly = plan({ id: 'm', billing_interval: 'month', price_cents: 100000 })
    const yearly = plan({ id: 'y', billing_interval: 'year', price_cents: 1000000 })

    const groups = groupPlans([monthly, yearly])

    expect(groups).toHaveLength(1)
    expect(groups[0].monthly?.id).toBe('m')
    expect(groups[0].yearly?.id).toBe('y')
    expect(groups[0].saving?.savingPercent).toBe(17)
  })

  it('prefers the monthly plan as the primary', () => {
    const groups = groupPlans([
      plan({ id: 'y', billing_interval: 'year' }),
      plan({ id: 'm', billing_interval: 'month' })
    ])
    expect(groups[0].primary.id).toBe('m')
  })

  it('keeps an ungrouped plan as its own group instead of dropping it', () => {
    // A plan the admin forgot to group must still render, not vanish.
    const groups = groupPlans([plan({ id: 'solo', plan_group: null })])
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('plan:solo')
    expect(groups[0].primary.id).toBe('solo')
  })

  it('preserves the order plans arrived in', () => {
    const groups = groupPlans([
      plan({ id: 'free', plan_group: 'club-free' }),
      plan({ id: 'prem', plan_group: 'club-premium' })
    ])
    expect(groups.map((g) => g.key)).toEqual(['club-free', 'club-premium'])
  })

  it('keeps the first of a duplicated interval rather than throwing', () => {
    const groups = groupPlans([
      plan({ id: 'm1', billing_interval: 'month' }),
      plan({ id: 'm2', billing_interval: 'month' })
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].monthly?.id).toBe('m1')
  })

  it('reports no saving for a group with only one interval', () => {
    expect(groupPlans([plan({ billing_interval: 'month' })])[0].saving).toBeNull()
  })

  it('is empty for no plans', () => {
    expect(groupPlans([])).toEqual([])
  })
})

describe('describeEntitlements', () => {
  it('describes the free plan as the database actually seeds it', () => {
    const rows = describeEntitlements({
      max_draft_events: 1,
      max_live_tournaments: 1,
      max_live_open_play: 1,
      max_members: null,
      online_fee_collection: false,
      verified_badge_eligible: false
    })

    expect(rows.find((r) => r.label === 'Draft events')?.value).toBe('1 draft event')
    expect(rows.find((r) => r.label === 'Members')?.value).toBe('Unlimited members')
    expect(rows.find((r) => r.label === 'Online entry fees')?.value).toBe('Not included')
  })

  it('says "eligible to apply", never "verified"', () => {
    // Paying queues the club for review. A card promising the badge would be
    // promising something the platform does not sell.
    const rows = describeEntitlements(plan().entitlements)
    const badge = rows.find((r) => r.label === 'Verified badge')?.value
    expect(badge).toBe('Eligible to apply')
    expect(badge).not.toMatch(/^Verified$/)
  })
})
