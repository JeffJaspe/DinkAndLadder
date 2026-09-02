/**
 * Back that returns where you actually came from.
 *
 * Every back affordance in the app was one of two broken things: a hardcoded
 * `<NuxtLink to="/players">`, which sends you to an index you may never have
 * been on — tap a name in a bracket, then Back, and you are on the player
 * directory instead of the draw — or `window.history.length > 1`, which counts
 * the whole TAB's history including pages from before the app was opened, so it
 * is true almost always and says nothing about whether *we* have a page to
 * return to.
 *
 * Vue Router stamps its own navigation state onto each history entry, and
 * `state.back` is the previous entry's path — null exactly when this page is
 * the first one in the stack (a deep link, a fresh tab, an external referrer).
 * That is the question a Back button is actually asking, so that is what this
 * reads. When there is nothing behind us, the caller's fallback route is used
 * rather than `router.back()`, which would leave the app entirely.
 *
 * The browser's own gesture — edge-swipe on iOS, the Android back button —
 * drives the same history stack, so a Back button built on this and the phone
 * gesture always agree.
 */
export function useAppBack(fallback: string) {
  const router = useRouter()

  /** Whether the router has a previous entry of ours to return to. */
  function canGoBack(): boolean {
    // `typeof window`, not `import.meta.client`: the question is whether a
    // history stack exists at all, which is also what makes this testable
    // outside a Nuxt runtime.
    if (typeof window === 'undefined') return false
    const state = window.history.state as { back?: string | null } | null
    return Boolean(state?.back)
  }

  function goBack() {
    if (canGoBack()) {
      router.back()
      return
    }
    navigateTo(fallback)
  }

  return { goBack, canGoBack }
}
