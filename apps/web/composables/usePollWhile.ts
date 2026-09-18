/**
 * Re-run something on an interval, but only while a condition holds and only
 * while the tab is visible.
 *
 * The same two guards as `useLiveScores`, lifted out so a second live surface
 * (the tournament draw, whose bracket rows carry their own running score) can
 * poll on the same terms without copying the timer logic. Nothing polls while
 * there is nothing live, and nothing polls in a pocket.
 */
export function usePollWhile(
  active: Ref<boolean> | ComputedRef<boolean>,
  tick: () => unknown,
  intervalMs = 5_000
) {
  let timer: ReturnType<typeof setInterval> | null = null

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function start() {
    stop()
    if (!active.value) return
    timer = setInterval(tick, intervalMs)
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stop()
      return
    }
    // Coming back: catch up now rather than waiting out an interval that was
    // never running.
    if (active.value) tick()
    start()
  }

  onMounted(() => {
    start()
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  watch(active, (isActive) => {
    if (isActive && !document.hidden) start()
    else stop()
  })

  onBeforeUnmount(() => {
    stop()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return { stop, start }
}
