<script setup lang="ts">
import type { TournamentDto } from '~/server/domains/event/dto/tournament.dto'

/**
 * Permanent redirect to the tournament's event.
 *
 * A tournament no longer has a page of its own. It never had much to put on
 * one — no dates, no venue, only a format and a match type — and giving it one
 * made an event look like a folder of tournaments that were themselves folders
 * of categories. The event page is now the tournament header, with the
 * categories directly beneath it.
 *
 * These URLs are in the wild, so the file stays. `?category=` is carried
 * through: it used to select a tab here and now opens that category's card, so
 * an old link still lands on the thing it was pointing at.
 */
const route = useRoute()
const tournamentId = route.params.tournamentId as string

const { data: tournament } = await useFetch<TournamentDto>(`/api/v1/tournaments/${tournamentId}`, {
  key: `tournament-redirect-${tournamentId}`
})

if (!tournament.value) {
  throw createError({ statusCode: 404, statusMessage: 'Tournament not found.' })
}

const category = Array.isArray(route.query.category)
  ? route.query.category[0]
  : route.query.category

await navigateTo(
  {
    path: `/events/${tournament.value.event_id}`,
    query: category ? { category } : {}
  },
  { replace: true, redirectCode: 301 }
)
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <p class="text-sm text-fg-muted">Taking you to the event…</p>
    </div>
  </div>
</template>
