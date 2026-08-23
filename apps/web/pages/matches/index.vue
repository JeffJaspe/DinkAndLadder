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
  participants: Array<{ player_id: string, team_number: 1 | 2, display_name: string }>
  scores: Array<{ set_number: number, team1_score: number, team2_score: number }>
}

const route = useRoute()
const router = useRouter()

const statusFilter = ref<string>(
  typeof route.query.status === 'string' ? route.query.status : 'all'
)

watch(statusFilter, (value) => {
  router.replace({ query: { ...route.query, status: value === 'all' ? undefined : value } })
})

const { data, pending, error, refresh } = await useFetch<{ data: MatchSummary[] }>(
  '/api/v1/players/me/matches',
  { query: { limit: 50 }, server: false }
)

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me', { server: false })

const matches = computed(() => data.value?.data ?? [])

/**
 * `submitted` and `pending_verification` both mean "waiting on someone", which
 * is the one distinction a player actually cares about here — so the Pending
 * chip covers both rather than exposing the internal state machine.
 */
const FILTERS = [
  { value: 'all', label: 'All', matches: () => true },
  { value: 'pending', label: 'Pending', matches: (m: MatchSummary) => m.status === 'submitted' || m.status === 'pending_verification' },
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

const STATUS_PILL: Record<string, { label: string, klass: string }> = {
  submitted: { label: 'Pending', klass: 'bg-warning/15 text-warning' },
  pending_verification: { label: 'Pending', klass: 'bg-warning/15 text-warning' },
  verified: { label: 'Verified', klass: 'bg-success/15 text-success' },
  disputed: { label: 'Disputed', klass: 'bg-danger/15 text-danger' },
  cancelled: { label: 'Cancelled', klass: 'bg-surface-2 text-fg-muted' }
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
</script>

<template>
  <div class="page-shell px-4 py-6 lg:px-6">
    <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-heading-1 text-fg">Matches</h1>
        <p class="mt-1 text-body-2 text-fg-secondary">Your match history and anything awaiting a decision.</p>
      </div>
      <UiButton to="/matches/submit" size="sm">
        <UiIcon name="plus" size="h-4 w-4" :stroke-width="2.5" />
        Submit match
      </UiButton>
    </header>

    <div class="mb-4 overflow-x-auto">
      <UiSegmented v-model="statusFilter" :items="filterItems" size="sm" label="Match status" />
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
      message="Play your first match to start your journey!"
      action-label="Submit a match"
      action-to="/matches/submit"
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
          class="flex items-center gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
        >
          <UiAvatar :name="opponents(match)" size="md" />

          <div class="min-w-0 flex-1">
            <p class="truncate text-body-2 font-medium text-fg">vs {{ opponents(match) }}</p>
            <p class="text-caption tabular-nums text-fg-secondary">{{ score(match) || 'No score recorded' }}</p>
            <p class="text-caption text-fg-muted">
              {{ match.match_type === 'singles' ? 'Singles' : 'Doubles' }} · {{ relative(match.played_at) }}
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
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
