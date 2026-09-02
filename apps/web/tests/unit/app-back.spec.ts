import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PageHeader from '~/components/ui/PageHeader.vue'
import { useAppBack } from '~/composables/useAppBack'

/**
 * Back used to be one of two wrong things: a hardcoded link to an index, or
 * `window.history.length > 1` — which counts the whole tab's history, including
 * pages visited before the app was ever opened, so it was true almost always.
 * Opening a profile from a bracket and pressing Back landed you on the player
 * directory, a page you had never seen.
 */

const back = vi.fn()
const navigate = vi.fn()

/** Vue Router stamps `state.back` with the previous entry, or null if none. */
function seedHistory(previous: string | null) {
  window.history.replaceState({ back: previous, current: '/players/p1' }, '')
}

beforeEach(() => {
  back.mockClear()
  navigate.mockClear()
  vi.stubGlobal('useRouter', () => ({ back, push: vi.fn(), replace: vi.fn() }))
  vi.stubGlobal('navigateTo', navigate)
  // Auto-imported in the app; PageHeader calls it as a global.
  vi.stubGlobal('useAppBack', useAppBack)
})

describe('useAppBack', () => {
  it('returns to the previous page when there is one', () => {
    seedHistory('/events/e1')
    useAppBack('/players').goBack()

    expect(back).toHaveBeenCalledOnce()
    expect(navigate).not.toHaveBeenCalled()
  })

  /** A deep link, a fresh tab, an emailed URL: nothing of ours behind us. */
  it('falls back to the given route when the page is the entry point', () => {
    seedHistory(null)
    useAppBack('/players').goBack()

    expect(back).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/players')
  })

  it('reports whether a back entry exists', () => {
    seedHistory('/feed')
    expect(useAppBack('/players').canGoBack()).toBe(true)

    seedHistory(null)
    expect(useAppBack('/players').canGoBack()).toBe(false)
  })
})

describe('UiPageHeader', () => {
  const stubs = { UiIcon: true }

  it('goes back rather than to its fallback route', async () => {
    seedHistory('/events/e1')
    const wrapper = mount(PageHeader, { props: { to: '/players' }, global: { stubs } })

    await wrapper.get('button').trigger('click')

    expect(back).toHaveBeenCalledOnce()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('uses the fallback route on a deep link', async () => {
    seedHistory(null)
    const wrapper = mount(PageHeader, { props: { to: '/players' }, global: { stubs } })

    await wrapper.get('button').trigger('click')

    expect(navigate).toHaveBeenCalledWith('/players')
  })
})
