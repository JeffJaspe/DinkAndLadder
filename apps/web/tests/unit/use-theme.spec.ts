/**
 * Covers the theme resolution logic in composables/useTheme.ts.
 *
 * Nuxt's `useCookie`/`useState` are auto-imported globals at runtime, so they
 * are stubbed here with ref-backed fakes. That keeps the test on the part that
 * can actually be wrong — how a preference plus the OS setting resolves to a
 * concrete theme — rather than on Nuxt's storage plumbing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref, type Ref } from 'vue'

const cookies = new Map<string, Ref<unknown>>()
const states = new Map<string, Ref<unknown>>()

vi.stubGlobal('computed', computed)
vi.stubGlobal('useCookie', (key: string, options?: { default?: () => unknown }) => {
  if (!cookies.has(key)) cookies.set(key, ref(options?.default?.()))
  return cookies.get(key)!
})
vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!states.has(key)) states.set(key, ref(init?.()))
  return states.get(key)!
})

const { useTheme, isThemePreference, THEME_COOKIE, THEME_DEFAULT } =
  await import('../../composables/useTheme')

describe('useTheme', () => {
  beforeEach(() => {
    cookies.clear()
    states.clear()
  })

  it('defaults to light, the product default', () => {
    const { preference, resolvedTheme, isDark } = useTheme()
    expect(THEME_DEFAULT).toBe('light')
    expect(preference.value).toBe('light')
    expect(resolvedTheme.value).toBe('light')
    expect(isDark.value).toBe(false)
  })

  it('persists under a stable cookie name', () => {
    // The pre-hydration script in nuxt.config reads this cookie by name; if the
    // two drift apart the page flashes the wrong theme on every load.
    expect(THEME_COOKIE).toBe('dnl-theme')
    useTheme()
    expect(cookies.has('dnl-theme')).toBe(true)
  })

  it('resolves an explicit preference regardless of the OS setting', () => {
    const { preference, systemPrefersDark, resolvedTheme } = useTheme()
    systemPrefersDark.value = true

    preference.value = 'light'
    expect(resolvedTheme.value).toBe('light')

    preference.value = 'dark'
    systemPrefersDark.value = false
    expect(resolvedTheme.value).toBe('dark')
  })

  it('follows the OS only when the preference is system', () => {
    const { preference, systemPrefersDark, resolvedTheme } = useTheme()
    preference.value = 'system'

    systemPrefersDark.value = true
    expect(resolvedTheme.value).toBe('dark')

    systemPrefersDark.value = false
    expect(resolvedTheme.value).toBe('light')
  })

  it('toggles against what is on screen, not against the stored preference', () => {
    // A `system` user seeing dark expects the toggle to give them light — not
    // to flip the preference to something that leaves the screen unchanged.
    const { preference, systemPrefersDark, resolvedTheme, toggleTheme } = useTheme()
    preference.value = 'system'
    systemPrefersDark.value = true

    toggleTheme()
    expect(preference.value).toBe('light')
    expect(resolvedTheme.value).toBe('light')

    toggleTheme()
    expect(preference.value).toBe('dark')
  })

  it('ignores an invalid preference rather than storing it', () => {
    const { preference, setTheme } = useTheme()
    setTheme('solarized' as never)
    expect(preference.value).toBe('light')
  })

  it('validates preference values', () => {
    expect(isThemePreference('light')).toBe(true)
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('system')).toBe(true)
    expect(isThemePreference('sepia')).toBe(false)
    expect(isThemePreference(undefined)).toBe(false)
  })
})
