/**
 * Component tests for the design-system primitives.
 *
 * These cover the parts that can silently be wrong and that a screenshot would
 * not catch: which element type renders, what ARIA is emitted, whether a
 * disabled control is really inert, and whether a value can escape its bounds.
 * Pure styling is left to the dual-theme Playwright pass.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import UiAvatar from '../../components/ui/Avatar.vue'
import UiButton from '../../components/ui/Button.vue'
import UiIcon from '../../components/ui/Icon.vue'
import UiRatingBadge from '../../components/ui/RatingBadge.vue'
import UiSegmented from '../../components/ui/Segmented.vue'
import UiStepper from '../../components/ui/Stepper.vue'
import UiTrendIndicator from '../../components/ui/TrendIndicator.vue'
import { ICON_PATHS } from '../../utils/icons'

// Components that render icons pull `UiIcon` from Nuxt's component
// auto-import, which does not exist here.
const global = { components: { UiIcon }, stubs: { NuxtLink: { template: '<a><slot /></a>' } } }

describe('UiIcon', () => {
  it('renders the registered path for a name', () => {
    const wrapper = mount(UiIcon, { props: { name: 'trophy' } })
    expect(wrapper.find('path').attributes('d')).toBe(ICON_PATHS.trophy)
  })

  it('is hidden from assistive tech unless it is given a label', () => {
    expect(mount(UiIcon, { props: { name: 'bell' } }).attributes('aria-hidden')).toBe('true')

    const labelled = mount(UiIcon, { props: { name: 'bell', label: 'Notifications' } })
    expect(labelled.attributes('aria-hidden')).toBeUndefined()
    expect(labelled.attributes('role')).toBe('img')
    expect(labelled.attributes('aria-label')).toBe('Notifications')
  })

  it('draws a real circle for glyphs that need one', () => {
    expect(mount(UiIcon, { props: { name: 'sun' } }).find('circle').exists()).toBe(true)
    expect(mount(UiIcon, { props: { name: 'moon' } }).find('circle').exists()).toBe(false)
  })
})

describe('UiButton', () => {
  it('renders a button by default and a link when given `to`', () => {
    expect(mount(UiButton, { global }).element.tagName).toBe('BUTTON')
    // A link that looks like a button must stay a link, or middle-click and
    // open-in-new-tab silently stop working.
    expect(mount(UiButton, { props: { to: '/rankings' }, global }).element.tagName).toBe('A')
  })

  it('falls back to a button when a link is disabled', () => {
    // `<a disabled>` does nothing in HTML, so a disabled link must not be a link.
    const wrapper = mount(UiButton, { props: { to: '/x', disabled: true }, global })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('disabled')).toBeDefined()
  })

  it('is inert and marked busy while loading', () => {
    const wrapper = mount(UiButton, { props: { loading: true }, global })
    expect(wrapper.attributes('disabled')).toBeDefined()
    expect(wrapper.attributes('aria-busy')).toBe('true')
  })

  it('styles danger as an outline, not a solid fill', () => {
    // Disputing a match is legitimate but must not be the easiest-looking
    // action on the page.
    const cls = mount(UiButton, { props: { variant: 'danger' }, global }).classes().join(' ')
    expect(cls).toContain('border-danger')
    // A hover wash is fine; a solid resting fill is what must not be there.
    expect(cls).not.toMatch(/(^|\s)bg-danger(\s|$)/)
  })
})

describe('UiAvatar', () => {
  it('derives initials from the first two words', () => {
    expect(mount(UiAvatar, { props: { name: 'Juan Dela Cruz' } }).text()).toBe('JD')
    expect(mount(UiAvatar, { props: { name: 'Cher' } }).text()).toBe('C')
  })

  it('falls back rather than rendering an empty circle', () => {
    expect(mount(UiAvatar, { props: { name: null } }).text()).toBe('?')
    expect(mount(UiAvatar, { props: { name: '   ' } }).text()).toBe('?')
  })

  it('gives the same name the same tint every time', () => {
    const a = mount(UiAvatar, { props: { name: 'Maria Santos' } }).classes().join(' ')
    const b = mount(UiAvatar, { props: { name: 'Maria Santos' } }).classes().join(' ')
    expect(a).toBe(b)
  })

  it('shows an image when one is supplied', () => {
    const wrapper = mount(UiAvatar, { props: { name: 'A B', src: 'https://example.test/a.png' } })
    expect(wrapper.find('img').exists()).toBe(true)
  })
})

describe('UiRatingBadge', () => {
  it('formats at the stored numeric(5,3) precision', () => {
    expect(mount(UiRatingBadge, { props: { rating: 4.25 } }).text()).toContain('4.250')
  })

  it('uses the real domain tier names, not the mockup medal names', () => {
    // The mockup shows Gold/Silver/Bronze/Iron on an ELO scale this platform
    // does not use. The bands are the nine in the rating domain.
    expect(mount(UiRatingBadge, { props: { rating: 4.25 } }).text()).toContain('Skilled')
    expect(mount(UiRatingBadge, { props: { rating: 2.1 } }).text()).toContain('Beginner')
    expect(mount(UiRatingBadge, { props: { rating: 6.5 } }).text()).toContain('Champion')
  })

  it('renders an em dash rather than NaN for an unrated player', () => {
    const wrapper = mount(UiRatingBadge, { props: { rating: null } })
    expect(wrapper.text()).toContain('—')
    expect(wrapper.text()).not.toContain('NaN')
  })

  it('flags a provisional rating', () => {
    expect(mount(UiRatingBadge, { props: { rating: 3.2, provisional: true } }).text()).toContain('provisional')
  })
})

describe('UiTrendIndicator', () => {
  it('signs the delta', () => {
    expect(mount(UiTrendIndicator, { props: { value: 0.12 }, global }).text()).toContain('+0.120')
    expect(mount(UiTrendIndicator, { props: { value: -0.045 }, global }).text()).toContain('-0.045')
  })

  it('carries direction in text as well as colour', () => {
    // Red/green alone is invisible to red-green colour blindness, and this is
    // the signal the rankings page exists to convey.
    expect(mount(UiTrendIndicator, { props: { value: 0.1 }, global }).text()).toContain('up')
    expect(mount(UiTrendIndicator, { props: { value: -0.1 }, global }).text()).toContain('down')
    expect(mount(UiTrendIndicator, { props: { value: 0 }, global }).text()).toContain('no change')
  })
})

describe('UiSegmented', () => {
  const items = [
    { value: 'singles', label: 'Singles' },
    { value: 'doubles', label: 'Doubles' }
  ]

  it('marks the selected segment for assistive tech', () => {
    const wrapper = mount(UiSegmented, { props: { items, modelValue: 'doubles' } })
    const buttons = wrapper.findAll('button')
    expect(buttons[0]!.attributes('aria-pressed')).toBe('false')
    expect(buttons[1]!.attributes('aria-pressed')).toBe('true')
  })

  it('emits the value that was clicked', async () => {
    const wrapper = mount(UiSegmented, { props: { items, modelValue: 'singles' } })
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['doubles'])
  })
})

describe('UiStepper', () => {
  const base = { modelValue: 5, label: 'Your score, game 1', min: 0, max: 21 }

  it('steps in both directions', async () => {
    const wrapper = mount(UiStepper, { props: base, global })
    const [dec, inc] = wrapper.findAll('button')
    await inc!.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([6])
    await dec!.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([4])
  })

  it('makes out-of-range values unreachable rather than merely rejected', async () => {
    const atMax = mount(UiStepper, { props: { ...base, modelValue: 21 }, global })
    expect(atMax.findAll('button')[1]!.attributes('disabled')).toBeDefined()

    const atMin = mount(UiStepper, { props: { ...base, modelValue: 0 }, global })
    expect(atMin.findAll('button')[0]!.attributes('disabled')).toBeDefined()
  })

  it('clamps typed input instead of trusting it', async () => {
    const wrapper = mount(UiStepper, { props: base, global })
    const input = wrapper.find('input')
    await input.setValue('999')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([21])
    await input.setValue('')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([0])
  })

  it('names both buttons for screen readers', () => {
    const wrapper = mount(UiStepper, { props: base, global })
    const [dec, inc] = wrapper.findAll('button')
    expect(dec!.attributes('aria-label')).toBe('Decrease Your score, game 1')
    expect(inc!.attributes('aria-label')).toBe('Increase Your score, game 1')
  })

  it('does not submit the surrounding form', () => {
    const wrapper = mount(UiStepper, { props: base, global })
    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('type')).toBe('button')
    }
  })
})

describe('component contracts', () => {
  it('every icon path is non-empty', () => {
    for (const [name, path] of Object.entries(ICON_PATHS)) {
      expect(path.length, name).toBeGreaterThan(4)
    }
  })

  it('does not leak console errors on mount', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mount(UiButton, { global })
    mount(UiAvatar, { props: { name: 'A' } })
    mount(UiRatingBadge, { props: { rating: 4 } })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
