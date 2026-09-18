import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BillingPlanCard from '../../components/billing/PlanCard.vue'
import UiIcon from '../../components/ui/Icon.vue'
import type { ClubSubscriptionPlanDto } from '../../server/domains/payment/dto/subscription.dto'

const global = { components: { UiIcon } }

function plan(over: Partial<ClubSubscriptionPlanDto> = {}): ClubSubscriptionPlanDto {
  return {
    id: 'p',
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

describe('BillingPlanCard', () => {
  it('contains no plan copy of its own — an empty row renders name, price and limits only', () => {
    const text = mount(BillingPlanCard, { props: { plan: plan() }, global }).text()
    expect(text).toContain('Premium')
    // The price pill: big whole number, currency code and period set apart.
    expect(text).toContain('999')
    expect(text).toContain('PHP')
    expect(text).toContain('/mo.')
    expect(text).not.toContain('999.00')
    // Nothing invented.
    expect(text).not.toMatch(/most popular|best value|recommended/i)
    // The limits table is derived from the enforced columns, not from copy.
    expect(text).toContain('Unlimited live tournaments')
    expect(text).toContain('Eligible to apply')
  })

  it('renders every string from the row', () => {
    const w = mount(BillingPlanCard, {
      props: {
        plan: plan({
          tagline: 'Run everything',
          description: 'For clubs with more than one court.',
          badge_label: 'Most popular',
          cta_label: 'Go Premium',
          marketing_bullets: ['Unlimited events', 'Online entry fees'],
          headline_figures: [{ value: '∞', label: 'events' }]
        })
      },
      global
    })
    const text = w.text()
    for (const s of ['Run everything', 'For clubs with more than one court.', 'Most popular', 'Go Premium', 'Unlimited events', 'Online entry fees', '∞', 'events']) {
      expect(text).toContain(s)
    }
  })

  it('sets the free plan as 0 PHP /mo. and disables its button', () => {
    const w = mount(BillingPlanCard, {
      props: { plan: plan({ price_cents: 0, is_default_free: true, name: 'Free' }) },
      global
    })
    expect(w.text()).toContain('0PHP/mo.')
    expect(w.find('button').attributes('disabled')).toBeDefined()
  })

  it('keeps minor units only when the price has them', () => {
    const w = mount(BillingPlanCard, { props: { plan: plan({ price_cents: 49950 }) }, global })
    expect(w.text()).toContain('499')
    expect(w.text()).toContain('.50')
  })

  it('renders the caption under the button and lists the enforced limits as check rows', () => {
    const w = mount(BillingPlanCard, {
      props: { plan: plan(), caption: '(test mode — nothing is charged)' },
      global
    })
    expect(w.text()).toContain('(test mode — nothing is charged)')
    expect(w.text()).toContain("What's included:")
    expect(w.text()).toContain('Unlimited live tournaments')
    expect(w.text()).toContain('Online entry fees')
  })

  it('the override savings label beats the computed one', () => {
    const saving = {
      monthlyTotalCents: 1198800,
      yearlyPriceCents: 999000,
      savingCents: 199800,
      savingPercent: 17,
      label: 'Save ₱1,998.00 (17%)'
    }
    const computedOnly = mount(BillingPlanCard, {
      props: { plan: plan({ billing_interval: 'year', price_cents: 999000 }), saving },
      global
    })
    expect(computedOnly.text()).toContain('Save ₱1,998.00 (17%)')

    const overridden = mount(BillingPlanCard, {
      props: {
        plan: plan({ billing_interval: 'year', price_cents: 999000, savings_label: 'Two months free' }),
        saving
      },
      global
    })
    expect(overridden.text()).toContain('Two months free')
    expect(overridden.text()).not.toContain('17%')
  })

  it('emits choose with the plan, and never while current', async () => {
    const w = mount(BillingPlanCard, { props: { plan: plan() }, global })
    await w.find('button').trigger('click')
    expect(w.emitted('choose')?.[0]?.[0]).toMatchObject({ id: 'p' })

    const current = mount(BillingPlanCard, { props: { plan: plan(), current: true }, global })
    expect(current.find('button').text()).toBe('Current plan')
    await current.find('button').trigger('click')
    expect(current.emitted('choose')).toBeUndefined()
  })

  it('hides the button entirely when asked', () => {
    const w = mount(BillingPlanCard, { props: { plan: plan(), hideAction: true }, global })
    expect(w.find('button').exists()).toBe(false)
  })
})
