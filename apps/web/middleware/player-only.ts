/**
 * Route guard for player-to-player surfaces.
 *
 * Community — duos, team-ups, who you have played with — has no meaning for a
 * club, so club mode leaves it out of the sidebar (layouts/default.vue). The
 * sidebar was the only thing keeping it out: a bookmark, an old tab, or a link
 * from another page landed a club-mode reader on it anyway. This closes the
 * gap at the route. The mode is a cookie (composables/useAccountMode.ts), so
 * the SSR pass sees it too and the redirect happens before any render.
 */
export default defineNuxtRouteMiddleware(() => {
  const { isClubMode } = useAccountMode()
  if (isClubMode.value) return navigateTo('/feed', { replace: true })
})
