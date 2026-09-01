/**
 * How many team-up invitations are waiting for the signed-in player to answer.
 *
 * The twin of `usePartnerRequestCount`. A duo request has had a badge on the
 * sidebar and on Community's Partners tab; a team-up request had none, so the
 * only way to discover one was to open the TeamUp tab and look. Both are asks
 * that need an answer, so both get announced the same way.
 *
 * One shared `useFetch` key, so the sidebar and Community read the same request
 * rather than each issuing their own on every navigation.
 * `refreshTeamUpRequestCount()` is what accepting or declining calls to clear
 * the badge without a reload.
 */
export function useTeamUpRequestCount() {
  const user = useSupabaseUser()

  const { data, refresh } = useFetch<{ data: { incoming: number } }>(
    '/api/v1/players/me/team/count',
    {
      key: 'team-up-request-count',
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

  return { incomingCount, refreshTeamUpRequestCount: refresh }
}
