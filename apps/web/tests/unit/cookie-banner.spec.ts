import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CookieBanner from '~/components/legal/CookieBanner.vue'
import { useConsent } from '~/composables/useConsent'
import { CONSENT_VERSION } from '~/utils/cookie-consent'

/**
 * The banner's contract is small and every line of it is a compliance point:
 * it shows until a real choice is stored, both answers are offered as equals,
 * there is no dismiss that counts as consent, and a choice made against an
 * older consent version brings it back.
 */

const stubs = {
  NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  UiButton: {
    props: ['variant'],
    template: '<button :data-variant="variant" @click="$emit(\'click\')"><slot /></button>'
  }
}

function mountBanner(props: Record<string, unknown> = {}) {
  return mount(CookieBanner, { props, global: { stubs } })
}

beforeEach(() => {
  // Auto-imported in the app; the component calls it as a global.
  vi.stubGlobal('useConsent', useConsent)
})

describe('LegalCookieBanner', () => {
  it('shows on a first visit with both answers and a link to the cookies page', () => {
    const wrapper = mountBanner()
    const buttons = wrapper.findAll('button').map((b) => b.text())
    expect(buttons).toEqual(['Essential only', 'Accept all'])
    expect(wrapper.find('a').attributes('href')).toBe('/legal/cookies')
    // A landmark, not a modal — nothing here should trap the visitor.
    expect(wrapper.find('[role="region"]').exists()).toBe(true)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('has no close control that could pass for consent', () => {
    const wrapper = mountBanner()
    expect(wrapper.findAll('button').some((b) => /close|dismiss|×/i.test(b.text()))).toBe(false)
    expect(wrapper.find('[aria-label="Close"]').exists()).toBe(false)
  })

  it('disappears once either answer is given, and the choice is stored', async () => {
    const wrapper = mountBanner()
    await wrapper.findAll('button')[0].trigger('click')
    expect(wrapper.find('[data-testid="cookie-banner"]').exists()).toBe(false)
    const { choice, hasChosen } = useConsent()
    expect(hasChosen.value).toBe(true)
    expect(choice.value).toBe('essential')
  })

  it('stays hidden when a current choice is already stored', () => {
    useConsent().accept('all')
    const wrapper = mountBanner()
    expect(wrapper.find('[data-testid="cookie-banner"]').exists()).toBe(false)
  })

  it('comes back when the stored choice predates the current consent version', () => {
    // Simulate arriving with a cookie written before a new category existed.
    const cookie = useCookie<unknown>('dnl-cookie-consent')
    cookie.value = { v: CONSENT_VERSION - 1, choice: 'all', at: '2026-01-01T00:00:00.000Z' }
    expect(useConsent().record.value).toBeNull()
    const wrapper = mountBanner()
    expect(wrapper.find('[data-testid="cookie-banner"]').exists()).toBe(true)
  })

  it('lifts itself above the mobile tab bar only when asked', () => {
    expect(mountBanner({ aboveTabBar: true }).find('section').classes()).toContain('bottom-16')
    expect(mountBanner().find('section').classes()).toContain('bottom-0')
  })
})
