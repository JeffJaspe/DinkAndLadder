/**
 * How many notifications the signed-in user has not read.
 *
 * The bell in the sidebar and the mobile header carried no badge at all, so the
 * only way to discover a notification was to go and look — which is why they
 * felt like they never arrived. `/api/v1/notifications/unread-count` already
 * existed and was consumed by exactly one page.
 *
 * Same shape as usePartnerRequestCount: one shared `useFetch` key so the
 * sidebar, the mobile header and the notifications page share a single request,
 * and `refreshUnreadNotificationCount()` is what marking-as-read calls to clear
 * the badge without a reload.
 */
export function useUnreadNotificationCount() {
  const user = useSupabaseUser()

  // The endpoint returns { data: { unread_count } } — the notifications page
  // used to read `.count` off the envelope and always got undefined.
  const { data, refresh } = useFetch<{ data: { unread_count: number } }>(
    '/api/v1/notifications/unread-count',
    {
      key: 'unread-notification-count',
      // A signed-out visitor has none, and asking would 401 on every page.
      immediate: !!user.value,
      // Client-only: a badge is chrome, and blocking SSR on it would slow the
      // first paint of every authenticated page for a number usually 0.
      server: false,
      default: () => ({ data: { unread_count: 0 } })
    }
  )

  const unreadCount = computed(() => data.value?.data.unread_count ?? 0)

  watch(user, (value) => {
    if (value) refresh()
  })

  return { unreadCount, refreshUnreadNotificationCount: refresh }
}
