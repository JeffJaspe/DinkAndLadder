import type { EventCourtDto } from '~/server/domains/event/dto/event.dto'

/**
 * The court board for an event, kept roughly current.
 *
 * Polling every 30 seconds plus a manual refresh, rather than Supabase
 * Realtime. A live pickleball score does not need to be accurate to the second,
 * and polling adds no new infrastructure and no new RLS surface. The cost of
 * polling is that you pay for every check whether or not anything changed, so
 * the two guards below are what make it reasonable rather than wasteful:
 *
 *   1. It only polls while at least one court is actually `playing`. A session
 *      that has not started, or has finished, costs nothing.
 *   2. It stops while the tab is hidden. A phone in somebody's pocket must not
 *      keep asking, which is where most of the waste would otherwise come from.
 *
 * Every consumer goes through this one composable, so swapping the transport
 * for Realtime later is a single-file change rather than a hunt through the
 * matches tab, the court cards and the tournament view.
 */
const POLL_INTERVAL_MS = 30_000

export function useLiveScores(eventId: Ref<string> | string) {
  const id = computed(() => (typeof eventId === 'string' ? eventId : eventId.value))

  const { data, pending, error, refresh } = useFetch<{ data: EventCourtDto[] }>(
    () => `/api/v1/events/${id.value}/courts`,
    {
      key: computed(() => `event-courts-${id.value}`),
      // Client-only: this is live state, so a server-rendered snapshot is
      // stale before it reaches the browser.
      server: false,
      default: () => ({ data: [] as EventCourtDto[] })
    }
  )

  const courts = computed(() => data.value?.data ?? [])

  /** Anything actually in play right now. Drives the red LIVE label. */
  const hasLiveCourt = computed(() => courts.value.some((court) => court.status === 'playing'))

  const lastUpdated = ref<Date | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null

  async function refreshNow() {
    await refresh()
    lastUpdated.value = new Date()
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function start() {
    stop()
    // Nothing playing and nothing to watch: do not open a timer at all.
    if (!hasLiveCourt.value) return
    timer = setInterval(refreshNow, POLL_INTERVAL_MS)
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stop()
      return
    }
    // Coming back to the tab: catch up immediately rather than waiting out the
    // remainder of an interval that was never running.
    refreshNow()
    start()
  }

  onMounted(() => {
    refreshNow()
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  // A session that starts or ends while the page is open has to start or stop
  // the timer without a reload.
  watch(hasLiveCourt, (live) => {
    if (live && !document.hidden) start()
    else stop()
  })

  onBeforeUnmount(() => {
    stop()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return {
    courts,
    hasLiveCourt,
    pending,
    error,
    lastUpdated,
    /** Manual refresh, for the button next to the LIVE label. */
    refresh: refreshNow
  }
}
