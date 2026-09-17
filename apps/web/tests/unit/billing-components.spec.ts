import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BillingCheckoutModal from '../../components/billing/CheckoutModal.vue'
import BillingUsageMeter from '../../components/billing/UsageMeter.vue'
import UiIcon from '../../components/ui/Icon.vue'
import UiButton from '../../components/ui/Button.vue'
import type { ClubSubscriptionPlanDto } from '../../server/domains/payment/dto/subscription.dto'
import { limitUpsell } from '../../utils/limit-upsell'

const plan: ClubSubscriptionPlanDto = {
  id: 'p',
  name: 'Premium',
  description: null,
  billing_interval: 'month',
  price_cents: 99900,
  currency: 'php',
  plan_group: null,
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
  }
}

/**
 * UiModal teleports to body, so the rendered content is read from the
 * document rather than the wrapper. A stub keeps the slot in place instead:
 * this spec is about what the checkout puts IN the modal, not the modal.
 */
const global = {
  components: { UiIcon, UiButton },
  stubs: {
    UiModal: {
      props: ['modelValue', 'title'],
      template: '<div v-if="modelValue"><h2>{{ title }}</h2><slot /></div>'
    }
  }
}

function mountCheckout(props: Partial<InstanceType<typeof BillingCheckoutModal>['$props']> = {}) {
  return mount(BillingCheckoutModal, {
    props: { modelValue: true, plan, billingMode: 'simulated', ...props },
    global
  })
}

describe('BillingCheckoutModal in test mode', () => {
  it('puts the test banner at the top, with the default sentence when none is configured', () => {
    const w = mountCheckout()
    const banner = w.find('[data-testid="checkout-test-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('no payment is taken')
    expect(banner.classes()).toContain('text-warning')
  })

  it('uses the SuperAdmin notice when one is set', () => {
    const w = mountCheckout({ billingNotice: 'Pilot programme — nothing is billed.' })
    expect(w.find('[data-testid="checkout-test-banner"]').text()).toBe('Pilot programme — nothing is billed.')
  })

  it('shows BOTH figures: the list price struck through and ₱0.00 due today', () => {
    const w = mountCheckout()
    const list = w.find('[data-testid="checkout-list-price"]')
    expect(list.text()).toBe('₱999.00')
    expect(list.classes()).toContain('line-through')
    expect(w.find('[data-testid="checkout-due-today"]').text()).toBe('₱0.00')
  })

  it('the confirm button never carries a currency amount', () => {
    const w = mountCheckout()
    const confirm = w.find('[data-testid="checkout-confirm"]')
    expect(confirm.text()).toBe('Activate (no payment)')
    expect(confirm.text()).not.toMatch(/₱|\d/)
  })

  it('emits the plan and a trimmed voucher, or null when blank', async () => {
    const w = mountCheckout()
    await w.find('[data-testid="checkout-confirm"]').trigger('click')
    expect(w.emitted('confirm')?.[0]?.[0]).toEqual({ plan_id: 'p', voucher_code: null })

    await w.find('#checkout-voucher').setValue('  SAVE10 ')
    await w.find('[data-testid="checkout-confirm"]').trigger('click')
    expect(w.emitted('confirm')?.[1]?.[0]).toEqual({ plan_id: 'p', voucher_code: 'SAVE10' })
  })

  it('routes a voucher error to the voucher field', async () => {
    const w = mountCheckout()
    await w.setProps({ error: 'That voucher code is not recognised. Vouchers are not available yet.' })
    expect(w.find('[role="alert"]').text()).toContain('voucher')
    expect(w.text()).not.toContain('Vouchers are coming soon.')
  })
})

describe('BillingCheckoutModal in live mode', () => {
  it('drops the banner and the strike-through, and charges the list price', () => {
    const w = mountCheckout({ billingMode: 'live' })
    expect(w.find('[data-testid="checkout-test-banner"]').exists()).toBe(false)
    expect(w.find('[data-testid="checkout-list-price"]').classes()).not.toContain('line-through')
    expect(w.find('[data-testid="checkout-due-today"]').text()).toBe('₱999.00')
    expect(w.find('[data-testid="checkout-confirm"]').text()).toBe('Pay and activate')
  })
})

describe('BillingUsageMeter', () => {
  const g = { components: { UiIcon } }

  it('reads "used of limit" and tones warning at the ceiling, never danger', () => {
    const w = mount(BillingUsageMeter, {
      props: { label: 'Live tournaments', used: 1, limit: 1, noun: 'tournament' },
      global: g
    })
    expect(w.text()).toContain('1 of 1')
    expect(w.text()).toContain('Nothing has been cancelled')
    expect(w.html()).toContain('text-warning')
    expect(w.html()).not.toContain('danger')
  })

  it('treats null as unlimited and draws no bar', () => {
    const w = mount(BillingUsageMeter, {
      props: { label: 'Members', used: 42, limit: null, noun: 'member' },
      global: g
    })
    expect(w.text()).toContain('42 · Unlimited')
    expect(w.find('[role="meter"]').exists()).toBe(false)
  })

  it('a zero limit is full, not unlimited', () => {
    const w = mount(BillingUsageMeter, {
      props: { label: 'Drafts', used: 0, limit: 0, noun: 'draft event' },
      global: g
    })
    expect(w.text()).toContain('No draft events')
    expect(w.find('[role="meter"]').attributes('aria-valuemax')).toBe('0')
  })
})

describe('limitUpsell', () => {
  const limitError = {
    data: { code: 'CLUB_EVENT_LIMIT', message: 'Your plan allows 1 tournament at a time.' }
  }

  it('maps a limit error to the sentence plus the billing link', () => {
    expect(limitUpsell(limitError, 'club-1')).toEqual({
      message: 'Your plan allows 1 tournament at a time.',
      ctaLabel: 'See plans',
      to: '/club/club-1/billing'
    })
  })

  it('recognises both limit codes and nothing else', () => {
    expect(limitUpsell({ data: { code: 'CLUB_DRAFT_LIMIT', message: 'x' } }, 'c')).not.toBeNull()
    expect(limitUpsell({ data: { code: 'VALIDATION_ERROR', message: 'x' } }, 'c')).toBeNull()
    expect(limitUpsell(new Error('boom'), 'c')).toBeNull()
  })

  it('gives up without a club to link to', () => {
    expect(limitUpsell(limitError, null)).toBeNull()
    expect(limitUpsell(limitError, '')).toBeNull()
  })
})
