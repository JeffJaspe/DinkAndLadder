/**
 * Theme preference: light (product default), dark, or follow the OS.
 *
 * Persistence is a cookie, not localStorage. Nuxt renders this app on the
 * server, and the server cannot read localStorage — it would emit the wrong
 * <html> class and the page would flash the wrong theme on every load. A cookie
 * travels with the request, so SSR gets it right the first time.
 *
 * See docs/33-DESIGN-SYSTEM-AND-THEMING-SPEC.md §3.4.
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_COOKIE = 'dnl-theme'
export const THEME_DEFAULT: ThemePreference = 'light'

const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system']

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

export function useTheme() {
  // A year, so the choice survives; `lax` because the theme is not a
  // cross-site concern and `strict` would drop it on inbound links.
  const preference = useCookie<ThemePreference>(THEME_COOKIE, {
    default: () => THEME_DEFAULT,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/'
  })

  // Only the browser knows the OS preference. On the server this stays false,
  // which resolves `system` to light — the same default a first-time visitor
  // gets, so the server never renders a theme it has to walk back. The
  // pre-hydration script in nuxt.config corrects the actual paint.
  const systemPrefersDark = useState<boolean>('dnl:system-prefers-dark', () => false)

  const resolvedTheme = computed<ResolvedTheme>(() => {
    if (preference.value === 'system') {
      return systemPrefersDark.value ? 'dark' : 'light'
    }
    return preference.value === 'dark' ? 'dark' : 'light'
  })

  const isDark = computed(() => resolvedTheme.value === 'dark')

  /**
   * Animate only the switch itself. A permanent global colour transition would
   * tax every hover and route change, so the class is added for the length of
   * the transition and removed again.
   */
  function markSwitching() {
    if (!import.meta.client) return
    const root = document.documentElement
    root.classList.add('dnl-theme-switching')
    // Comfortably longer than the 150ms transition: `useHead` patches the
    // `dark` class asynchronously, so the colours do not start moving on the
    // same tick as the click. A 200ms window was being torn down while the
    // transition was still running, which left colours frozen part-way.
    window.setTimeout(() => root.classList.remove('dnl-theme-switching'), 500)
  }

  function setTheme(next: ThemePreference) {
    if (!isThemePreference(next) || next === preference.value) return
    markSwitching()
    preference.value = next
  }

  /** Sidebar / mobile quick toggle: flips whatever is currently on screen. */
  function toggleTheme() {
    setTheme(resolvedTheme.value === 'dark' ? 'light' : 'dark')
  }

  return {
    preference,
    resolvedTheme,
    isDark,
    systemPrefersDark,
    setTheme,
    toggleTheme,
    options: THEME_PREFERENCES
  }
}
