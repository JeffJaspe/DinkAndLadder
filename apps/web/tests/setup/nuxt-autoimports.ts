/**
 * Nuxt auto-imports do not exist under plain Vitest, so a `.vue` file that
 * calls `computed()` or `useTheme()` without importing them throws
 * `ReferenceError` the moment it is mounted.
 *
 * This registers just the globals the UI components actually reach for. It is
 * an explicit list rather than a Nuxt test environment on purpose: these are
 * presentational components, and booting a Nuxt runtime per test file would add
 * seconds without covering anything extra.
 *
 * The theme stubs are ref-backed and reset between files, so a component test
 * can drive the theme (`setTheme('dark')`) and assert what renders.
 */

import * as vue from 'vue'
import { beforeEach, vi } from 'vitest'

// Vue reactivity + lifecycle used inside `<script setup>`.
for (const name of [
  'computed',
  'ref',
  'reactive',
  'watch',
  'watchEffect',
  'onMounted',
  'onBeforeUnmount',
  'onUnmounted',
  'nextTick',
  'toRef',
  'toRefs',
  'useSlots',
  'useAttrs',
  'inject',
  'provide'
] as const) {
  vi.stubGlobal(name, (vue as unknown as Record<string, unknown>)[name])
}

const cookies = new Map<string, ReturnType<typeof vue.ref>>()
const states = new Map<string, ReturnType<typeof vue.ref>>()

vi.stubGlobal('useCookie', (key: string, options?: { default?: () => unknown }) => {
  if (!cookies.has(key)) cookies.set(key, vue.ref(options?.default?.()))
  return cookies.get(key)!
})

vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!states.has(key)) states.set(key, vue.ref(init?.()))
  return states.get(key)!
})

// `resolveComponent` is a Vue runtime helper Nuxt auto-imports. Components
// that render <NuxtLink> conditionally call it, so it must resolve to something
// mountable rather than throw.
vi.stubGlobal('resolveComponent', (name: string) => name)

// Router/navigation stubs so components with links or `navigateTo` mount.
vi.stubGlobal('navigateTo', vi.fn())
vi.stubGlobal('useRoute', () => ({ path: '/', params: {}, query: {}, fullPath: '/' }))
vi.stubGlobal('useRouter', () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }))

beforeEach(() => {
  cookies.clear()
  states.clear()
})
