/**
 * Applies the resolved theme to <html>.
 *
 * Runs on server and client. `useHead` owns the class attribute so Vue and the
 * head manager never fight over it — a plugin that called `classList.add`
 * directly would be undone the next time the head was patched.
 *
 * The OS preference is read synchronously here, before `useHead` runs, so the
 * very first client render of a `system` user already carries the right class
 * and hydration does not have to correct itself.
 *
 * See docs/33-DESIGN-SYSTEM-AND-THEMING-SPEC.md §3.4.
 */
export default defineNuxtPlugin(() => {
  const { resolvedTheme, systemPrefersDark } = useTheme()

  if (import.meta.client) {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    systemPrefersDark.value = query.matches
    // Users on `system` should follow the OS flipping mid-session (macOS and
    // Windows both switch on a schedule), not just at load.
    query.addEventListener('change', (event) => {
      systemPrefersDark.value = event.matches
    })
  }

  useHead({
    htmlAttrs: {
      class: computed(() => (resolvedTheme.value === 'dark' ? 'dark' : '')),
      // Not used for styling — it is the stable hook for Playwright's
      // dual-theme screenshots and for any future `[data-theme]` overrides.
      'data-theme': computed(() => resolvedTheme.value)
    },
    meta: [
      {
        // Makes native UI — scrollbars, form autofill, date pickers — follow
        // the app theme instead of the OS one.
        name: 'color-scheme',
        content: computed(() => resolvedTheme.value)
      }
    ]
  })
})
