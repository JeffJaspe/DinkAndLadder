/**
 * How many duo requests are waiting for the signed-in player to answer.
 *
 * An incoming request used to be announced only by a notification row, which is
 * a place nobody is looking. This is the number behind the badge on the sidebar
 * and on Community's Partners tab.
 *
 * One shared `useFetch` key, so the sidebar and Community read the same request
 * rather than each issuing their own on every navigation. `refreshPartnerRequestCount()`
 * is what accepting or declining calls to clear the badge without a reload.
 */
export function usePartnerRequestCount() {
  const user = useSupabaseUser()

  const { data, refresh } = useFetch<{ data: { incoming: number } }>(
    '/api/v1/players/me/partner-requests/count',
    {
      key: 'partner-request-count',
      // A signed-out visitor has no requests, and asking would 401 on every page.
      immediate: !!user.value,
      // Client-only: the badge is chrome, and blocking SSR on it would slow the
      // first paint of every authenticated page for a number that is usually 0.
      server: false,
      default: () => ({ data: { incoming: 0 } })
    }
  )

  const incomingCount = computed(() => data.value?.data.incoming ?? 0)

  // Signing in mid-session has to fill the badge; signing out has to empty it.
  watch(user, (value) => {
    if (value) refresh()
  })

  return { incomingCount, refreshPartnerRequestCount: refresh }
}
