/**
 * Paints the SuperAdmin's chosen palette (docs/30 §2.2, revised).
 *
 * The stylesheet is built on the server and inlined into the head, so the very
 * first paint already carries the brand colours. Fetching it after hydration
 * would show the design system's own green for a frame and then swap — worse
 * than not theming at all.
 *
 * `useAsyncData` under a fixed key means one request per page load shared by
 * everything, and the payload travels with SSR so the client does not refetch.
 *
 * Nothing here handles light versus dark: the palette carries both, and the CSS
 * targets `html:root` and `html:root.dark` so the existing theme switch keeps
 * doing that job.
 */
export default defineNuxtPlugin(async () => {
  const { data } = await useAsyncData('platform:theme', () =>
    $fetch<{ data: { css: string } }>('/api/v1/platform/theme')
  )

  useHead({
    style: computed(() => {
      const css = data.value?.data.css
      // No palette selected, or the read failed: emit nothing and let the
      // design system's own tokens stand.
      return css ? [{ id: 'dnl-palette', textContent: css }] : []
    })
  })
})
