<script setup lang="ts">
/**
 * Matches list — mobile mockup screen 3 (docs/33 §5.7).
 *
 * This screen did not exist. The mobile tab bar's "Matches" went straight to the
 * submit form, so there was no way to see your own match history or, more
 * importantly, find the match that is blocking your rating update. Status
 * filtering is the whole point of the screen: a player opens it to answer
 * "what am I waiting on?".
 *
 * Read-only over `/api/v1/players/me/matches`, which RLS already restricts to
 * matches the caller played in.
 */
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

useHead({ title: 'Matches' })

interface MatchSummary {
  id: string
  match_type: 'singles' | 'doubles'
  status: string
  played_at: string
  participants: Array<{
    player_id: string
    team_number: 1 | 2
    display_name: string
    avatar_url: string | null
  }>
  scores: Array<{ set_number: number; team1_score: number; team2_score: number }>
  rating_delta: number | null
  new_rating: number | null
}

const route = useRoute()
const router = useRouter()

const statusFilter = ref<string>(
  typeof route.query.status === 'string' ? route.query.status : 'all'
)

watch(statusFilter, (value) => {
  router.replace({ query: { ...route.query, status: value === 'all' ? undefined : value } })
})

/**
 * A page at a time, with an optional date window.
 *
 * The list used to ask for 50 and render whatever came back, so an account with
 * more than that simply could not reach its older matches — there was no next
 * page and no way to narrow by when something was played.
 */
const PAGE_SIZE = 25
const page = ref(0)
const fromDate = ref('')
const toDate = ref('')

// Any change to the window starts again at the first page: staying on page 3 of
// a different result set shows a page that has nothing to do with the filter.
watch([fromDate, toDate, statusFilter], () => {
  page.value = 0
})

const { data, pending, error, refresh } = useFetch<{ data: MatchSummary[] }>(
  '/api/v1/players/me/matches',
  {
    query: computed(() => ({
      limit: PAGE_SIZE,
      offset: page.value * PAGE_SIZE,
      from: fromDate.value || undefined,
      to: toDate.value || undefined
    })),
    watch: [page, fromDate, toDate],
    server: false
  }
)

/** A short page means there is nothing after it. */
const hasNextPage = computed(() => (data.value?.data.length ?? 0) === PAGE_SIZE)

const { data: myProfile } = useFetch<PlayerProfileDto>('/api/v1/players/me', {
  server: false
})

const matches = computed(() => data.value?.data ?? [])

/**
 * `submitted` and `pending_verification` both mean "waiting on someone", which
 * is the one distinction a player actually cares about here — so the Pending
 * chip covers both rather than exposing the internal state machine.
 */
const FILTERS = [
  { value: 'all', label: 'All', matches: () => true },
  {
    value: 'pending',
    label: 'Pending',
    matches: (m: MatchSummary) => m.status === 'submitted' || m.status === 'pending_verification'
  },
  { value: 'verified', label: 'Verified', matches: (m: MatchSummary) => m.status === 'verified' },
  { value: 'disputed', label: 'Disputed', matches: (m: MatchSummary) => m.status === 'disputed' }
]

const counts = computed(() =>
  Object.fromEntries(FILTERS.map((f) => [f.value, matches.value.filter(f.matches).length]))
)

const filterItems = computed(() =>
  FILTERS.map((f) => ({ value: f.value, label: f.label, count: counts.value[f.value] ?? 0 }))
)

const visible = computed(() => {
  const filter = FILTERS.find((f) => f.value === statusFilter.value) ?? FILTERS[0]!
  return matches.value.filter(filter.matches)
})

const STATUS_PILL: Record<string, { label: string; klass: string }> = {
  submitted: { label: 'Pending', klass: 'bg-warning-soft text-warning' },
  pending_verification: { label: 'Pending', klass: 'bg-warning-soft text-warning' },
  verified: { label: 'Verified', klass: 'bg-success-soft text-success' },
  disputed: { label: 'Disputed', klass: 'bg-danger-soft text-danger' },
  cancelled: { label: 'Cancelled', klass: 'bg-surface-2 text-fg-muted' }
}

/**
 * The one opponent, or null in doubles.
 *
 * The avatar beside this row used to be built from `opponents()`, which joins
 * names — so a doubles row rendered the initials of a person who does not
 * exist. A pair has no face; only a single opponent does.
 */
function soleOpponent(match: MatchSummary): { id: string; avatar_url: string | null } | null {
  const myTeam = match.participants.find((p) => p.player_id === myProfile.value?.id)?.team_number
  const others = match.participants.filter((p) => p.team_number !== myTeam)
  if (others.length !== 1) return null
  const opponent = others[0]
  return opponent ? { id: opponent.player_id, avatar_url: opponent.avatar_url } : null
}

function opponents(match: MatchSummary): string {
  const myTeam = match.participants.find((p) => p.player_id === myProfile.value?.id)?.team_number
  const others = match.participants.filter((p) => p.team_number !== myTeam)
  return others.map((p) => p.display_name).join(' & ') || 'Unknown'
}

/** `21-18, 21-16` — the canonical score format across the app. */
function score(match: MatchSummary): string {
  return match.scores.map((s) => `${s.team1_score}-${s.team2_score}`).join(', ')
}

function outcome(match: MatchSummary): 'win' | 'loss' | null {
  const myTeam = match.participants.find((p) => p.player_id === myProfile.value?.id)?.team_number
  if (!myTeam || !match.scores.length) return null
  const won = match.scores.filter((s) =>
    myTeam === 1 ? s.team1_score > s.team2_score : s.team2_score > s.team1_score
  ).length
  return won > match.scores.length / 2 ? 'win' : 'loss'
}

function relative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * Explains why the rating changed the way it did.
 * For doubles: individual vs opponent team average (new algorithm v2).
 * For singles: team vs team expected share.
 */
function ratingExplanation(match: MatchSummary): string | null {
  if (match.rating_delta === null) return null
  const won = outcome(match) === 'win'
  const delta = match.rating_delta

  if (won && delta > 0) {
    return 'Won and outperformed expectations based on rating gap.'
  }
  if (won && delta < 0) {
    return 'Won, but point margin was below expected for the rating gap. Rating adjusts toward true skill.'
  }
  if (won && delta === 0) {
    return 'Won as expected.'
  }
  if (!won && delta < 0) {
    return 'Lost as expected based on rating gap.'
  }
  if (!won && delta > 0) {
    return 'Lost, but performed better than expected based on rating gap.'
  }
  return 'Rating unchanged.'
}

/**
 * A named handler rather than two statements in the template.
 * `@click="fromDate = ''; toDate = ''"` is valid only while it stays on one
 * line: the formatter is entitled to break it across lines, and Vue's
 * expression parser rejects the multi-line form outright — the whole page
 * stopped compiling.
 */
function clearDates() {
  fromDate.value = ''
  toDate.value = ''
}
</script>

<template>
  <div class="page-shell px-4 py-6 lg:px-6">
    <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-heading-1 text-fg">Matches</h1>
        <p class="mt-1 text-body-2 text-fg-secondary">
          Every result an organiser has recorded for you, and anything still awaiting a decision.
        </p>
      </div>
      <UiButton to="/events" size="sm" variant="secondary">
        <UiIcon name="calendar" size="h-4 w-4" :stroke-width="2" />
        Find an event
      </UiButton>
    </header>

    <div class="mb-4 overflow-x-auto">
      <UiSegmented v-model="statusFilter" :items="filterItems" size="sm" label="Match status" />
    </div>

    <!-- Narrowing by when something was played. Sent to the server, so it
         narrows the query rather than the page that happened to load. -->
    <div class="mb-4 flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-caption text-fg-secondary">From</span>
        <input
          v-model="fromDate"
          type="date"
          class="rounded-button border border-border-strong bg-surface px-3 py-1.5 text-body-2 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-caption text-fg-secondary">To</span>
        <input
          v-model="toDate"
          type="date"
          class="rounded-button border border-border-strong bg-surface px-3 py-1.5 text-body-2 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>
      <button
        v-if="fromDate || toDate"
        type="button"
        class="pb-1.5 text-body-2 text-primary hover:underline"
        @click="clearDates"
      >
        Clear dates
      </button>
    </div>

    <UiErrorState
      v-if="error"
      message="Could not load your matches."
      :detail="error.message"
      @retry="refresh()"
    />

    <div v-else-if="pending" class="space-y-2">
      <div v-for="n in 5" :key="n" class="h-20 animate-pulse rounded-card bg-surface" />
    </div>

    <UiEmptyState
      v-else-if="!matches.length"
      title="No matches yet"
      message="Play at an open play session, ladder night or tournament — the organiser records the result and it lands here."
      action-label="Find an event"
      action-to="/events"
    />

    <UiEmptyState
      v-else-if="!visible.length"
      compact
      icon="filter"
      title="Nothing here"
      :message="`You have no ${statusFilter} matches.`"
    />

    <ul v-else class="space-y-2">
      <li v-for="match in visible" :key="match.id">
        <NuxtLink
          :to="`/matches/${match.id}`"
          class="flex items-center gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-2 shadow-card hover:shadow-card-hover"
        >
          <UiAvatar
            :name="opponents(match)"
            :src="soleOpponent(match)?.avatar_url"
            :identity-key="soleOpponent(match)?.id"
            size="md"
          />

          <div class="min-w-0 flex-1">
            <p class="truncate text-body-2 font-medium text-fg">vs {{ opponents(match) }}</p>
            <p class="text-caption tabular-nums text-fg-secondary">
              {{ score(match) || 'No score recorded' }}
            </p>
            <p class="text-caption text-fg-muted">
              {{ match.match_type === 'singles' ? 'Singles' : 'Doubles' }} ·
              {{ relative(match.played_at) }}
            </p>
          </div>

          <div class="flex shrink-0 flex-col items-end gap-1.5">
            <span
              class="rounded-badge px-2 py-0.5 text-caption font-medium"
              :class="STATUS_PILL[match.status]?.klass ?? 'bg-surface-2 text-fg-muted'"
            >
              {{ STATUS_PILL[match.status]?.label ?? match.status }}
            </span>
            <span
              v-if="outcome(match)"
              class="text-caption font-semibold"
              :class="outcome(match) === 'win' ? 'text-success' : 'text-danger'"
            >
              {{ outcome(match) === 'win' ? 'Win' : 'Loss' }}
            </span>
            <!-- Rating change with explanation tooltip -->
            <span
              v-if="match.rating_delta !== null"
              class="text-caption font-medium tabular-nums cursor-help"
              :class="match.rating_delta > 0 ? 'text-success' : match.rating_delta < 0 ? 'text-danger' : 'text-fg-muted'"
              :title="ratingExplanation(match) ?? undefined"
            >
              {{ match.rating_delta > 0 ? '+' : '' }}{{ match.rating_delta.toFixed(3) }}
            </span>
          </div>
        </NuxtLink>
      </li>
    </ul>

    <!-- Pager. Shown whenever there is somewhere to go, so a full first page
         does not look like the whole history. -->
    <div
      v-if="!pending && (page > 0 || hasNextPage)"
      class="mt-5 flex items-center justify-between gap-3"
    >
      <UiButton size="sm" variant="ghost" :disabled="page === 0" @click="page = page - 1">
        Previous
      </UiButton>
      <span class="text-caption text-fg-muted">Page {{ page + 1 }}</span>
      <UiButton size="sm" variant="ghost" :disabled="!hasNextPage" @click="page = page + 1">
        Next
      </UiButton>
    </div>
  </div>
</template>
