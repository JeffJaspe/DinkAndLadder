import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AdminNavGroup from '~/components/AdminNavGroup.vue'
import type { IconName } from '~/utils/icons'

/**
 * The point of this component is that platform-admin destinations cannot be
 * mistaken for personal settings. That is carried by three things — a heading
 * that names who can see the block, a container that separates it from the rest
 * of the nav, and the fact that it never renders for anyone else — and all
 * three are one careless edit away from disappearing.
 */

const items: { name: string; href: string; icon: IconName }[] = [
  { name: 'Reports', href: '/admin/reports', icon: 'alert' },
  { name: 'Fees & payments', href: '/admin/fees', icon: 'stats' }
]

function mountGroup(props: Record<string, unknown> = {}) {
  return mount(AdminNavGroup, {
    props: { items, isActive: () => false, ...props },
    global: {
      stubs: {
        NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        UiIcon: { props: ['name'], template: '<span :data-icon="name" />' }
      }
    }
  })
}

describe('AdminNavGroup', () => {
  it('says out loud that the block is not something everyone sees', () => {
    const wrapper = mountGroup()
    expect(wrapper.text()).toContain('Platform admin')
    expect(wrapper.text()).toContain('Only you can see this')
  })

  it('keeps the items out of the accessibility tree while collapsed', () => {
    const wrapper = mountGroup()
    const toggle = wrapper.get('button')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    // v-show, so the links exist in the DOM but are display:none — which both
    // removes them from the accessibility tree and matches what aria-expanded
    // is claiming.
    const panelId = toggle.attributes('aria-controls')!
    expect(wrapper.get(`#${panelId}`).attributes('style')).toContain('display: none')
  })

  it('opens on the toggle and lists every destination', async () => {
    const wrapper = mountGroup({ open: true })
    const links = wrapper.findAll('a')
    expect(links).toHaveLength(2)
    expect(links[1]!.attributes('href')).toBe('/admin/fees')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })

  it('marks the current destination for assistive tech, not just visually', () => {
    const wrapper = mountGroup({ open: true, isActive: (href: string) => href === '/admin/fees' })
    const links = wrapper.findAll('a')
    expect(links[0]!.attributes('aria-current')).toBeUndefined()
    expect(links[1]!.attributes('aria-current')).toBe('page')
  })
})
