<script setup lang="ts">
import type {
  BracketDto,
  LiveBracketScore,
  RecordBracketResultInput
} from '~/server/domains/event/dto/bracket.dto'
import type { EventDto } from '~/server/domains/event/dto/event.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type {
  TournamentDto,
  TournamentRegistrationWithPlayerDto
} from '~/server/domains/event/dto/tournament.dto'
import type { TournamentCategoryDto } from '~/server/domains/event/dto/tournament-category.dto'
import { apiErrorMessage } from '~/utils/api-error-message'

/**
 * One category's board, on its own screen.
 *
 * This is the second screen at the desk: the draw as a draw, the live courts
 * above it, and the score controls in reach — all at full width with the app
 * shell out of the way. Running a category from inside an expanded card works
 * on a laptop and is hopeless on a TV nobody can scroll.
 *
 * It shows ONE category, because that is what is being played at any moment.
 * The event-wide version of this link opened every draw at once, which is the
 * picture nobody wanted, and it has been removed from the tournament header.
 *
 * `layout: false` rather than a wider page-shell — the sidebar, the bottom tab
 * bar and the page chrome are all cost with no benefit on a screen showing one
 * thing.
 */
definePageMeta({ layout: false })

const route = useRoute()
const eventId = route.params.eventId as string

const { data: event, error: eventError } = await useFetch<EventDto>(`/api/v1/events/${eventId}`)

/**
 * The event's draw.
 *
 * `{ tournaments: [...] }`, not `{ data: [...] }` — this endpoint names its own
 * collection while its neighbours use `data`, and this page read `.data[0]`.
 * That is why it opened to nothing: `tournament` was permanently null, so the
 * categories and the bracket were never fetched and there was no error to show
 * either. Nothing about the draw was wrong; the page simply never asked for it.
 */
const { data: tournamentsData } = await useFetch<{ tournaments: TournamentDto[] }>(
  `/api/v1/events/${eventId}/tournaments`
)

const tournament = computed(() => tournamentsData.value?.tournaments?.[0] ?? null)

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

const {
  data: categoriesData,
  error: categoriesError,
  refresh: refreshCategories
} = useLazyFetch<{ data: TournamentCategoryDto[] }>(
  () => `/api/v1/tournaments/${tournament.value?.id}/categories`,
  {
    // Not immediate: with no tournament yet the URL would name `undefined`, and
    // a getter that returns `''` instead still issues a request — one that
    // resolves to this page and hands back HTML where a list was expected.
    immediate: false,
    server: false,
    default: () => ({ data: [] as TournamentCategoryDto[] })
  }
)

const categories = computed(() => categoriesData.value?.data ?? [])

// `?category=` so the link from a category card opens on that draw, and a
// second screen can be pointed at one category and left alone.
const activeCategoryId = ref<string>(
  typeof route.query.category === 'string' ? route.query.category : ''
)

watch(
  categories,
  (list) => {
    if (!activeCategoryId.value && list.length) activeCategoryId.value = list[0]!.id
  },
  { immediate: true }
)

const activeCategory = computed(
  () => categories.value.find((c) => c.id === activeCategoryId.value) ?? null
)

/**
 * The draw for the category on screen.
 *
 * Both this and the category list are fetched explicitly rather than by a
 * reactive URL that starts empty: a getter returning `''` still issues a
 * request, and it comes back as this page's own HTML. The page then rendered
 * neither a draw nor an error — just nothing, which is what "opens and shows
 * nothing" turned out to be.
 */
const {
  data: bracketData,
  pending: bracketPending,
  error: bracketError,
  refresh: refreshBracket
} = useLazyFetch<BracketDto>(
  () =>
    `/api/v1/tournaments/${tournament.value?.id}/bracket` +
    (activeCategoryId.value ? `?category_id=${activeCategoryId.value}` : ''),
  { immediate: false, server: false }
)

/**
 * The field for this category.
 *
 * A board at the desk gets asked "who is in this draw" as often as "what is the
 * score", and answering it meant going back to the event page. `{ registrations
 * : [...] }`, like the tournaments endpoint — this API names its collections
 * rather than using `data`.
 */
const { data: registrationsData, refresh: refreshRegistrations } = useLazyFetch<{
  registrations: TournamentRegistrationWithPlayerDto[]
}>(() => `/api/v1/tournaments/${tournament.value?.id}/registrations`, {
  immediate: false,
  server: false,
  default: () => ({ registrations: [] as TournamentRegistrationWithPlayerDto[] })
})

/** Confirmed entrants in the category on screen, as the sheet would list them. */
const categoryPlayers = computed(() =>
  (registrationsData.value?.registrations ?? []).filter(
    (reg) =>
      reg.status === 'confirmed' &&
      (!activeCategoryId.value || reg.category_id === activeCategoryId.value)
  )
)

/**
 * Nothing is fetched until there is a tournament to fetch for.
 *
 * Declared after every `refresh` it calls: `immediate: true` runs this during
 * setup, so a fetch declared below it is still in the temporal dead zone and
 * the whole page 500s with "Cannot access … before initialization". Third time
 * this shape has bitten today — a `const` used at setup time must be declared
 * above the thing that uses it, however lazy it looks.
 */
watch(
  tournament,
  (value) => {
    if (!value) return
    refreshCategories()
    refreshBracket()
    refreshRegistrations()
  },
  { immediate: true }
)

/** Switching draw re-reads the board it is switching to. */
watch(activeCategoryId, (id) => {
  if (id && tournament.value) refreshBracket()
})

const { courts, hasLiveCourt, refresh: refreshCourts } = useLiveScores(eventId)

/** The courts belonging to this event that are actually in play, first. */
const orderedCourts = computed(() =>
  [...courts.value].sort(
    (a, b) => Number(b.status === 'playing') - Number(a.status === 'playing')
  )
)

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
    // The bracket, because a result advances the winner (and the loser too);
    // the courts, because the score may have come off one.
    await Promise.all([refreshBracket(), refreshCourts()])
  } catch (err) {
    recordError.value = apiErrorMessage(err, 'Could not record that result.')
  } finally {
    recordingId.value = null
  }
}

async function startMatch(bracketMatchId: string) {
  recordError.value = ''
  try {
    await $fetch(`/api/v1/bracket-matches/${bracketMatchId}/start`, { method: 'POST' })
    await refreshBracket()
  } catch (err) {
    recordError.value = apiErrorMessage(err, 'Could not start that match.')
  }
}

/**
 * A point, sent without re-reading the draw behind it.
 *
 * Same rule as the tournament card: the row shows the tap immediately, so a
 * refetch per point would only make the board lag the person pressing the
 * button. A failure re-reads, which is what puts the score back.
 */
async function updateLiveScore(bracketMatchId: string, scores: LiveBracketScore[]) {
  try {
    await $fetch(`/api/v1/bracket-matches/${bracketMatchId}/score`, {
      method: 'PATCH',
      body: { scores }
    })
  } catch (err) {
    recordError.value = apiErrorMessage(err, 'Could not update the score.')
    await refreshBracket()
  }
}

async function updateCourtScore(courtId: string, scores: LiveBracketScore[]) {
  try {
    await $fetch(`/api/v1/events/${eventId}/courts/${courtId}/score`, {
      method: 'PATCH',
      body: { scores }
    })
  } catch (err) {
    recordError.value = apiErrorMessage(err, 'Could not update the score.')
    await refreshCourts()
  }
}

/** Same palette the in-page draw uses, so the two read as one board. */
const matchStatusConfig: Record<string, { bg: string; border: string }> = {
  pending: { bg: 'bg-surface-2', border: 'border-border' },
  ready: { bg: 'bg-warning-soft', border: 'border-warning/30' },
  in_progress: { bg: 'bg-primary/10', border: 'border-primary/30' },
  completed: { bg: 'bg-primary/10', border: 'border-primary/30' },
  bye: { bg: 'bg-surface-2', border: 'border-border-strong' }
}

const champion = computed(() => {
  const rounds = bracketData.value?.rounds ?? []
  const final = rounds[rounds.length - 1]?.matches ?? []
  const decided = final.find((m) => m.winner_registration_id)
  if (!decided) return null
  return decided.winner_registration_id === decided.participant1_registration_id
    ? decided.participant1
    : decided.participant2
})

const loadError = computed(() => eventError.value || categoriesError.value || bracketError.value)

useHead({
  title: () =>
    activeCategory.value
      ? `${activeCategory.value.name} — ${event.value?.name ?? 'Matches'}`
      : (event.value?.name ?? 'Matches')
})
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
        <h1 class="mt-1 truncate text-2xl font-bold text-fg lg:text-3xl">
          {{ activeCategory?.name ?? event?.name ?? 'Matches' }}
        </h1>
        <p class="text-body-2 text-fg-muted">{{ event?.name }}</p>
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

    <p v-if="recordError" role="alert" class="mb-4 text-body-2 text-danger">{{ recordError }}</p>

    <!-- A blank screen is the one thing this page must never be: it is left
         open on a wall where nobody is watching a console. -->
    <UiErrorState
      v-if="loadError"
      title="Could not load this board"
      message="The draw could not be fetched. It may still be loading, or the event may have no tournament attached."
      @retry="refreshBracket()"
    />

    <template v-else>
      <!-- Live courts first: the thing happening right now goes at the top of
           the screen the room is looking at. Scoring is here rather than only
           on the event page, so the desk can run the session from this screen. -->
      <section v-if="orderedCourts.length" class="mb-6">
        <h2 class="mb-2 text-caption font-semibold uppercase tracking-wide text-fg-muted">
          Courts
        </h2>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <EventCourtCard
            v-for="court in orderedCourts"
            :key="court.id"
            :court="court"
            :can-manage="canManage"
            @score="updateCourtScore(court.id, $event)"
          />
        </div>
      </section>

      <div v-if="bracketPending" class="space-y-3">
        <div v-for="i in 6" :key="i" class="h-16 animate-pulse rounded-card bg-surface" />
      </div>

      <UiEmptyState
        v-else-if="!bracketData?.rounds?.length"
        title="No draw yet"
        message="Matches appear here once the organiser generates the draw."
      />

      <div v-else class="space-y-6">
        <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <!-- The draw, drawn as a draw. This is the half the page was missing:
               it listed the matches and never showed the bracket, which is the
               thing a screen at the desk exists to display. -->
          <section class="overflow-x-auto rounded-card bg-surface p-4 shadow-card lg:p-6">
            <h2 class="mb-4 text-caption font-semibold uppercase tracking-wide text-fg-muted">
              Draw
            </h2>
            <TournamentBracketTree
              :rounds="bracketData.rounds"
              :status-config="matchStatusConfig"
              :champion="champion"
              show-champion
            />
          </section>

          <!-- The field, beside the draw rather than a page away: "who is in
               this category" is asked at the desk as often as "what is the
               score". Read-only here — approving an entry is the event page's
               job, not a wall screen's. -->
          <section class="rounded-card bg-surface p-4 shadow-card lg:p-6">
            <h2 class="mb-4 text-caption font-semibold uppercase tracking-wide text-fg-muted">
              Players
            </h2>
            <TournamentCategoryPlayers
              :confirmed="categoryPlayers"
              :pending="[]"
              :can-review="false"
              :reviewing-id="null"
              review-error=""
            />
          </section>
        </div>

        <!-- The same rows the category card uses, in the order the desk works
             through them: playable first, then waiting, then done. -->
        <section class="rounded-card bg-surface p-4 shadow-card lg:p-6">
          <h2 class="mb-4 text-caption font-semibold uppercase tracking-wide text-fg-muted">
            Order of play
          </h2>
          <TournamentCategoryMatches
            :bracket="bracketData"
            :can-manage="canManage"
            :recording-id="recordingId"
            :record-error="recordError"
            @record="recordResult"
            @start="startMatch"
            @score="updateLiveScore"
          />
        </section>
      </div>
    </template>
  </div>
</template>
