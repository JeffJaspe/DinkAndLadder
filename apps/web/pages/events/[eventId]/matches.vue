<script setup lang="ts">
import type { BracketDto, RecordBracketResultInput } from '~/server/domains/event/dto/bracket.dto'
import type { EventDto } from '~/server/domains/event/dto/event.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { TournamentDto } from '~/server/domains/event/dto/tournament.dto'
import type { TournamentCategoryDto } from '~/server/domains/event/dto/tournament-category.dto'
import { apiErrorMessage } from '~/utils/api-error-message'

/**
 * The matches board on its own page, for a second screen at the desk.
 *
 * Running a draw from inside an expanded category card works on a laptop and is
 * hopeless on the TV nobody can scroll. This is the same board with the app
 * shell out of the way: every row visible, nothing competing for width.
 *
 * `layout: false` rather than a wider page-shell — the sidebar, the bottom tab
 * bar and the page chrome are all cost with no benefit on a screen showing one
 * thing.
 */
definePageMeta({ layout: false })

const route = useRoute()
const eventId = route.params.eventId as string

const { data: event } = await useFetch<EventDto>(`/api/v1/events/${eventId}`)

useHead({ title: () => (event.value ? `${event.value.name} — Matches` : 'Matches') })

const { data: tournamentsData } = await useFetch<{ data: TournamentDto[] }>(
  `/api/v1/events/${eventId}/tournaments`
)

const tournament = computed(() => tournamentsData.value?.data?.[0] ?? null)

const { data: myProfile } = useFetch<PlayerProfileDto>('/api/v1/players/me', { server: false })

/**
 * Only the event's creator can record from here.
 *
 * Deliberately narrower than the event page, which also admits club staff: this
 * page is designed to be left open on a shared screen, and a shared screen is
 * the wrong place to widen who can write a result.
 */
const canManage = computed(
  () => !!myProfile.value && event.value?.created_by_player_id === myProfile.value.id
)

// Reactive URL rather than `immediate: false` plus a watcher: the fetch fires
// as soon as the tournament id resolves, and refires if it changes.
const { data: categoriesData } = useLazyFetch<{ data: TournamentCategoryDto[] }>(
  () => (tournament.value ? `/api/v1/tournaments/${tournament.value.id}/categories` : ''),
  { server: false, default: () => ({ data: [] as TournamentCategoryDto[] }) }
)

const categories = computed(() => categoriesData.value?.data ?? [])

// `?category=` so a link from the event page opens on the same draw, and a
// second screen can be pointed at one category and left alone.
const activeCategoryId = ref<string>(
  typeof route.query.category === 'string' ? route.query.category : ''
)

watch(
  categories,
  (list) => {
    if (!activeCategoryId.value && list.length) activeCategoryId.value = list[0].id
  },
  { immediate: true }
)

const bracketUrl = computed(() => {
  if (!tournament.value) return ''
  const base = `/api/v1/tournaments/${tournament.value.id}/bracket`
  return activeCategoryId.value ? `${base}?category_id=${activeCategoryId.value}` : base
})

const {
  data: bracketData,
  pending: bracketPending,
  refresh: refreshBracket
} = useLazyFetch<BracketDto>(() => bracketUrl.value, { server: false })

const { courts, hasLiveCourt, refresh: refreshCourts } = useLiveScores(eventId)

const recordingId = ref<string | null>(null)
const recordError = ref('')

async function recordResult(bracketMatchId: string, input: RecordBracketResultInput) {
  recordingId.value = bracketMatchId
  recordError.value = ''
  try {
    await $fetch(`/api/v1/bracket-matches/${bracketMatchId}/result`, {
      method: 'POST',
      body: input
    })
    // The bracket, because a result advances the winner (and now the loser too);
    // the courts, because the score may have come off one.
    await Promise.all([refreshBracket(), refreshCourts()])
  } catch (err) {
    recordError.value = apiErrorMessage(err, 'Could not record that result.')
  } finally {
    recordingId.value = null
  }
}

const activeCategory = computed(
  () => categories.value.find((c) => c.id === activeCategoryId.value) ?? null
)
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-8">
    <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <NuxtLink
          :to="`/events/${eventId}`"
          class="inline-flex items-center gap-1.5 text-body-2 text-fg-muted hover:text-fg"
        >
          <UiIcon name="arrow-left" size="h-4 w-4" />
          Back to the event
        </NuxtLink>
        <h1 class="mt-1 text-2xl font-bold text-fg lg:text-3xl">
          {{ event?.name ?? 'Matches' }}
        </h1>
        <p v-if="activeCategory" class="text-body-2 text-fg-muted">{{ activeCategory.name }}</p>
      </div>

      <div class="flex items-center gap-3">
        <span
          v-if="hasLiveCourt"
          class="inline-flex items-center gap-1.5 rounded-pill bg-danger/15 px-2.5 py-1 text-caption font-semibold uppercase tracking-wide text-danger"
        >
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
          Live
        </span>
        <UiButton variant="ghost" size="sm" @click="refreshBracket()">Refresh</UiButton>
      </div>
    </header>

    <!-- Category switcher, only when there is more than one draw to switch. -->
    <div v-if="categories.length > 1" class="mb-4 flex flex-wrap gap-2">
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="rounded-pill px-3 py-1.5 text-body-2 transition-colors"
        :class="
          activeCategoryId === category.id
            ? 'bg-primary text-on-primary'
            : 'bg-surface text-fg-secondary hover:bg-surface-2'
        "
        @click="activeCategoryId = category.id"
      >
        {{ category.name }}
      </button>
    </div>

    <!-- Live courts, when the session has any. A tournament run alongside open
         play shows both; a pure bracket event simply has none. -->
    <div v-if="courts.length" class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <EventCourtCard v-for="court in courts" :key="court.id" :court="court" :can-manage="false" />
    </div>

    <div v-if="bracketPending" class="space-y-3">
      <div v-for="i in 6" :key="i" class="h-16 animate-pulse rounded-card bg-surface" />
    </div>

    <UiEmptyState
      v-else-if="!bracketData?.rounds?.length"
      title="No draw yet"
      message="Matches appear here once the organiser generates the draw."
    />

    <div v-else class="rounded-card bg-surface p-4 shadow-card lg:p-6">
      <TournamentCategoryMatches
        :bracket="bracketData"
        :can-manage="canManage"
        :recording-id="recordingId"
        :record-error="recordError"
        @record="recordResult"
      />
    </div>
  </div>
</template>
