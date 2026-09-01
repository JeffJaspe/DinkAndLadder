<script setup lang="ts">
import type { UserDto } from '~/server/domains/identity/dto/user.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { RankingEntryDto } from '~/server/domains/rating/dto/ranking.dto'
import type { RatingTransactionDto } from '~/server/domains/rating/dto/rating.dto'
import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'
// Imported rather than re-declared locally. The hand-written copy this
// replaces had already drifted from the real DTO - the same mismatch that
// left every unread indicator on /notifications permanently false.
import type { ShoutoutDto } from '~/server/domains/shoutout/dto/shoutout.dto'
import { tierForRating } from '~/utils/rating-tiers'

useHead({ title: 'Dashboard' })

interface MatchSummary {
  id: string
  match_type: 'singles' | 'doubles'
  status: string
  played_at: string
  participants: Array<{ player_id: string; team_number: 1 | 2; display_name: string }>
  scores: Array<{ set_number: number; team1_score: number; team2_score: number }>
  /** What this match did to the reader's rating. Null when it was not rated. */
  rating_delta?: number | null
  new_rating?: number | null
}

interface UpcomingEventEntry {
  event: {
    id: string
    name: string
    venue: string | null
    city: string | null
    start_date: string
    end_date: string
  }
  registration_status: string
}

interface PendingActionsResponse {
  pending_verifications: Array<{ match_id: string; match_type: string; played_at: string }>
  pending_memberships: Array<{ club_id: string; club_name: string }>
  total: number
}

interface BadgeDefinition {
  id: string
  name: string
  icon: string
  description: string
  category: string
}

interface BadgeShowcaseDto {
  playerId: string
  selectedBadgeId: string | null
  updatedAt: string
}

interface BadgeResponse {
  showcase: BadgeShowcaseDto | null
  availableBadges: BadgeDefinition[]
}

/**
 * The seven server-rendered reads behind the dashboard, fired together.
 *
 * Each was a separate top-level `await useFetch`, which suspends setup until
 * it resolves — so the dashboard cost the sum of its queries, not the slowest
 * of them, and it is the first screen after sign-in. Still awaited, because
 * these render server-side; just concurrently.
 */
const currentUserQuery = useFetch<UserDto>('/api/v1/auth/me')
const myProfileQuery = useFetch<PlayerProfileDto>('/api/v1/players/me')
const ratingsQuery = useFetch<{
  singles?: { rating_value: number }
  doubles?: { rating_value: number }
}>('/api/v1/players/me/ratings')
const myClubsQuery = useFetch<{ items: MyClubMembershipDto[] }>('/api/v1/clubs/mine')
/**
 * Both lists are first pages now, not fixed windows.
 *
 * Recent Matches asked for five and stopped; My Upcoming Events asked for
 * everything and rendered all of it. Neither could be walked. Same page size
 * for both, appended below with a Show more button — see `loadMoreMatches` /
 * `loadMoreEvents`.
 */
const LIST_PAGE_SIZE = 5

const recentMatchesQuery = useFetch<{ data: MatchSummary[] }>('/api/v1/players/me/matches', {
  query: { limit: LIST_PAGE_SIZE, offset: 0 }
})
const upcomingEventsQuery = useFetch<{ data: UpcomingEventEntry[]; has_more?: boolean }>(
  '/api/v1/players/me/upcoming-events',
  { query: { limit: LIST_PAGE_SIZE, offset: 0 } }
)
const pendingActionsQuery = useFetch<{ data: PendingActionsResponse }>(
  '/api/v1/players/me/pending-actions'
)

await Promise.all([
  currentUserQuery,
  myProfileQuery,
  ratingsQuery,
  myClubsQuery,
  recentMatchesQuery,
  upcomingEventsQuery,
  pendingActionsQuery
])

const { data: currentUser, pending, error } = currentUserQuery
const { data: myProfile } = myProfileQuery
const { data: ratingsData } = ratingsQuery
const { data: myClubsData } = myClubsQuery
const { data: recentMatches } = recentMatchesQuery
const { data: upcomingEvents } = upcomingEventsQuery

/**
 * Pages 2..n for the two lists.
 *
 * Held apart from the `useFetch` data so a refresh still means "reload the
 * first page" rather than silently dropping whatever was appended. Same shape
 * as the feed's loadMore, minus the scroll sentinel: these are short panels on
 * a dashboard, so a button the reader chooses to press beats an infinite list
 * that pushes everything below it out of reach.
 */
const moreMatches = ref<MatchSummary[]>([])
const matchesEnd = ref(false)
const loadingMatches = ref(false)

const allRecentMatches = computed(() => [...(recentMatches.value?.data ?? []), ...moreMatches.value])

watch(
  recentMatches,
  (value) => {
    moreMatches.value = []
    matchesEnd.value = (value?.data?.length ?? 0) < LIST_PAGE_SIZE
  },
  { immediate: true }
)

async function loadMoreMatches() {
  if (loadingMatches.value || matchesEnd.value) return
  loadingMatches.value = true
  try {
    const response = await $fetch<{ data: MatchSummary[] }>('/api/v1/players/me/matches', {
      query: { limit: LIST_PAGE_SIZE, offset: allRecentMatches.value.length }
    })
    const batch = response.data ?? []
    moreMatches.value = [...moreMatches.value, ...batch]
    if (batch.length < LIST_PAGE_SIZE) matchesEnd.value = true
  } catch {
    // Keep the button: a failed page is worth another press, and replacing the
    // matches already on screen with an error would cost more than it explains.
  } finally {
    loadingMatches.value = false
  }
}

const moreEvents = ref<UpcomingEventEntry[]>([])
const eventsEnd = ref(false)
const loadingEvents = ref(false)

const allUpcomingEvents = computed(() => [
  ...(upcomingEvents.value?.data ?? []),
  ...moreEvents.value
])

watch(
  upcomingEvents,
  (value) => {
    moreEvents.value = []
    // This endpoint says so outright, so there is no need to infer it from a
    // short page.
    eventsEnd.value = value?.has_more === false
  },
  { immediate: true }
)

async function loadMoreEvents() {
  if (loadingEvents.value || eventsEnd.value) return
  loadingEvents.value = true
  try {
    const response = await $fetch<{ data: UpcomingEventEntry[]; has_more?: boolean }>(
      '/api/v1/players/me/upcoming-events',
      { query: { limit: LIST_PAGE_SIZE, offset: allUpcomingEvents.value.length } }
    )
    moreEvents.value = [...moreEvents.value, ...(response.data ?? [])]
    if (response.has_more === false) eventsEnd.value = true
  } catch {
    // As above.
  } finally {
    loadingEvents.value = false
  }
}
const { data: pendingActions } = pendingActionsQuery

// Only active memberships in My Clubs; pending ones are shown in Pending Actions.
const myActiveClubs = computed(
  () => myClubsData.value?.items.filter((m) => m.status === 'active') ?? []
)
const { data: myShoutout, refresh: refreshShoutout } = useFetch<{ data: ShoutoutDto | null }>(
  '/api/v1/players/me/shoutout',
  { server: false }
)
const { data: badgeData, refresh: refreshBadge } = useFetch<{ data: BadgeResponse }>(
  '/api/v1/players/me/badge',
  { server: false }
)

const supabase = useSupabaseClient()

const badgeSelectorOpen = ref(false)
const badgeSaving = ref(false)

const selectedBadge = computed(() => {
  if (!badgeData.value?.data?.showcase?.selectedBadgeId) return null
  return badgeData.value.data.availableBadges.find(
    (b) => b.id === badgeData.value!.data.showcase!.selectedBadgeId
  )
})

async function selectBadge(badgeId: string | null) {
  badgeSaving.value = true
  try {
    await $fetch('/api/v1/players/me/badge', {
      method: 'PUT',
      body: { badge_id: badgeId }
    })
    await refreshBadge()
    badgeSelectorOpen.value = false
  } finally {
    badgeSaving.value = false
  }
}

const shoutoutInput = ref('')
const shoutoutEventId = ref('')
const shoutoutError = ref('')

/**
 * Events this shout-out may be attached to: ones the player created or is
 * registered for. Lazy and client-only — the picker is optional, nobody should
 * wait on it to type a message, and the server re-checks the id anyway
 * (ShoutoutService.validateEventLink). This list is a convenience, not a gate.
 */
const { data: linkableEventsData } = useLazyFetch<{
  data: { id: string; title?: string; name?: string; start_date: string | null }[]
}>('/api/v1/players/me/linkable-events', {
  server: false,
  default: () => ({ data: [] })
})

const linkableEvents = computed(() => linkableEventsData.value?.data ?? [])
const shoutoutEditing = ref(false)
const shoutoutSaving = ref(false)

const shoutoutExamples = [
  'Looking for a doubles partner',
  'LFG doubles 4.0+',
  'Hosting open play this weekend',
  'New to the area, looking for clubs'
]

async function saveShoutout() {
  if (!shoutoutInput.value.trim()) return
  shoutoutSaving.value = true
  shoutoutError.value = ''
  try {
    const isEditing = !!myShoutout.value?.data
    await $fetch('/api/v1/players/me/shoutout', {
      method: isEditing ? 'PUT' : 'POST',
      body: {
        message: shoutoutInput.value.trim(),
        event_id: shoutoutEventId.value || null
      }
    })
    await refreshShoutout()
    shoutoutEditing.value = false
    shoutoutInput.value = ''
    shoutoutEventId.value = ''
  } catch (err) {
    // Phone numbers are rejected server-side (CONTACT_INFO_NOT_ALLOWED) and the
    // message explains why, so it has to be shown rather than swallowed — this
    // used to fail silently with the composer still full of text.
    const fetchError = err as { data?: { message?: string } }
    shoutoutError.value = fetchError.data?.message ?? 'Could not post your shout-out.'
  } finally {
    shoutoutSaving.value = false
  }
}

const shoutoutExpiresIn = computed(() => {
  if (!myShoutout.value?.data?.expires_at) return null
  const expiresAt = new Date(myShoutout.value.data.expires_at).getTime()
  const now = Date.now()
  const diff = expiresAt - now
  if (diff <= 0) return 'Expired'
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${minutes}m left`
  return `${minutes}m left`
})

function startEditingShoutout() {
  shoutoutInput.value = myShoutout.value?.data?.message ?? ''
  shoutoutEventId.value = myShoutout.value?.data?.event_id ?? ''
  shoutoutError.value = ''
  shoutoutEditing.value = true
}

async function handleLogout() {
  await supabase.auth.signOut()
  await navigateTo('/login')
}

const activeRatingType = ref<'singles' | 'doubles'>('singles')
const singlesRating = computed(() => ratingsData.value?.singles?.rating_value ?? 0)
const doublesRating = computed(() => ratingsData.value?.doubles?.rating_value ?? 0)
const displayRating = computed(() =>
  activeRatingType.value === 'singles' ? singlesRating.value : doublesRating.value
)

// Same nine bands the rating domain defines. This page previously carried its
// own five-tier table (Professional/Advanced/Intermediate/Beginner/Novice at
// 5.5/4.5/3.5/3.0) which matched neither the domain nor RatingBadge, so the
// dashboard and a player's own badge could disagree about their tier.
const ratingTier = computed(() =>
  displayRating.value > 0 ? tierForRating(displayRating.value).name : 'Unrated'
)

const { data: rankingData } = await useFetch<{ data: RankingEntryDto[] }>('/api/v1/rankings', {
  query: {
    rating_type: activeRatingType,
    province: computed(() => myProfile.value?.province || undefined),
    limit: 100
  },
  watch: [activeRatingType]
})

const myRankEntry = computed(() => {
  if (!myProfile.value || !rankingData.value?.data) return null
  return rankingData.value.data.find((r) => r.player_id === myProfile.value!.id) ?? null
})

const { data: historyData } = await useFetch<{ data: RatingTransactionDto[] }>(
  '/api/v1/players/me/rating-history',
  {
    query: { type: activeRatingType },
    watch: [activeRatingType]
  }
)

/**
 * Oldest first, by when the match was played.
 *
 * The endpoint returns newest-first by `created_at`, which is when the rating
 * engine wrote the row. Those two orders agree for a match rated live and
 * disagree completely after a backfill, so the sort is on `occurred_at` rather
 * than a plain reverse.
 */
const ratingHistoryChronological = computed(() =>
  [...(historyData.value?.data ?? [])].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  )
)

/**
 * Rating Progress chart (docs/33 §5.2 / §5.8).
 *
 * Was a 12-bar sparkline with no time axis, so a rating that moved twice in one
 * day looked identical to one that moved twice in a year. Now a real line over
 * a chosen range, plotted against actual dates.
 */
const RANGES = [
  { value: '7d', label: '7D', days: 7 },
  { value: '1m', label: '1M', days: 30 },
  { value: '3m', label: '3M', days: 90 },
  { value: '6m', label: '6M', days: 180 },
  { value: '1y', label: '1Y', days: 365 },
  { value: 'all', label: 'ALL', days: null }
] as const

const chartRange = ref<string>('3m')

const chartPoints = computed(() => {
  const all = ratingHistoryChronological.value.map((t) => ({
    // When the match was played, not when the engine wrote the row — otherwise
    // a backfilled season lands inside one afternoon and every range from 7D to
    // ALL draws the identical line.
    date: t.occurred_at,
    value: t.new_rating
  }))

  const range = RANGES.find((r) => r.value === chartRange.value)
  if (!range?.days) return all

  const cutoff = Date.now() - range.days * 24 * 60 * 60 * 1000
  const windowed = all.filter((p) => new Date(p.date).getTime() >= cutoff)

  // A range with a single point cannot draw a line. Carrying the last earlier
  // point in gives the line a starting anchor instead of an empty chart for
  // someone who played once last month.
  if (windowed.length < 2) {
    const earlier = all.filter((p) => new Date(p.date).getTime() < cutoff)
    const anchor = earlier[earlier.length - 1]
    return anchor ? [anchor, ...windowed] : windowed
  }
  return windowed
})

function getOpponentNames(match: MatchSummary): string {
  const myTeam = match.participants.find((p) => p.player_id === myProfile.value?.id)?.team_number
  const opponents = match.participants.filter((p) => p.team_number !== myTeam)
  return opponents.map((p) => p.display_name).join(' & ') || 'Unknown'
}

function didIWin(match: MatchSummary): boolean | null {
  const myTeam = match.participants.find((p) => p.player_id === myProfile.value?.id)?.team_number
  if (!myTeam || match.scores.length === 0) return null
  const mySets = match.scores.filter((s) =>
    myTeam === 1 ? s.team1_score > s.team2_score : s.team2_score > s.team1_score
  ).length
  return mySets > match.scores.length / 2
}

function formatScore(match: MatchSummary): string {
  return match.scores.map((s) => `${s.team1_score}-${s.team2_score}`).join(', ')
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function formatEventDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <!-- Loading State -->
    <div v-if="pending" class="space-y-4">
      <div class="h-24 animate-pulse rounded-xl bg-surface" />
      <div class="grid grid-cols-2 gap-4">
        <div class="h-32 animate-pulse rounded-xl bg-surface" />
        <div class="h-32 animate-pulse rounded-xl bg-surface" />
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center">
      <p class="text-red-400">Could not load your profile. Please try again.</p>
      <button class="mt-4 rounded-lg bg-primary px-4 py-2 text-on-primary" @click="$router.go(0)">
        Retry
      </button>
    </div>

    <!-- Content -->
    <div v-else-if="currentUser" class="page-shell space-y-5">
      <!-- Header -->
      <div class="flex items-start justify-between">
        <div>
          <p class="text-sm text-fg-secondary">Welcome to the Dashboard,</p>
          <h1 class="text-2xl font-bold text-fg">
            {{ myProfile?.display_name || currentUser.email?.split('@')[0] }}! 👋
          </h1>
          <p class="mt-1 text-sm text-fg-muted">Let's climb the ladder today.</p>
        </div>
        <button
          class="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-2"
          @click="handleLogout"
        >
          Log Out
        </button>
      </div>

      <!-- Shout-out Section -->
      <div class="rounded-xl bg-surface p-5 shadow-card">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-xs font-medium uppercase tracking-wider text-fg-muted">SHOUT-OUT</span>
          <button
            v-if="myShoutout?.data && !shoutoutEditing"
            class="text-xs text-primary hover:underline"
            @click="startEditingShoutout"
          >
            Edit
          </button>
        </div>

        <!-- Display current shout-out -->
        <div v-if="myShoutout?.data && !shoutoutEditing" class="flex items-start gap-3">
          <span class="text-2xl">📣</span>
          <div class="flex-1">
            <p class="text-fg">"{{ myShoutout.data.message }}"</p>
            <div class="mt-1 flex items-center gap-3 text-xs text-fg-muted">
              <span>Posted {{ formatRelativeTime(myShoutout.data.created_at) }}</span>
              <span
                v-if="shoutoutExpiresIn"
                class="rounded-full bg-primary/10 px-2 py-0.5 text-primary"
              >
                {{ shoutoutExpiresIn }}
              </span>
            </div>
          </div>
        </div>

        <!-- Edit/Create shout-out -->
        <div v-else-if="shoutoutEditing || !myShoutout?.data">
          <div class="flex gap-2">
            <input
              v-model="shoutoutInput"
              type="text"
              placeholder="What's on your mind?"
              maxlength="280"
              class="flex-1 rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:outline-none"
              @keyup.enter="saveShoutout"
            />
            <button
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
              :disabled="shoutoutSaving || !shoutoutInput.trim()"
              @click="saveShoutout"
            >
              {{ shoutoutSaving ? '...' : shoutoutEditing ? 'Update' : 'Post' }}
            </button>
            <button
              v-if="shoutoutEditing"
              class="rounded-lg border border-border-strong px-3 py-2 text-sm text-fg-secondary hover:bg-surface-2"
              @click="shoutoutEditing = false"
            >
              Cancel
            </button>
          </div>
          <div v-if="!myShoutout?.data" class="mt-3 flex flex-wrap gap-2">
            <button
              v-for="example in shoutoutExamples"
              :key="example"
              class="rounded-full border border-border-strong px-3 py-1 text-xs text-fg-muted hover:border-primary hover:text-fg"
              @click="shoutoutInput = example"
            >
              {{ example }}
            </button>
          </div>
          <!-- Optional event link. Only rendered when there is something to
               attach — an empty select is just a puzzle. -->
          <div v-if="linkableEvents.length" class="mt-3">
            <label for="shoutout-event" class="mb-1 block text-xs text-fg-muted">
              Link an event (optional)
            </label>
            <select
              id="shoutout-event"
              v-model="shoutoutEventId"
              class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
            >
              <option value="">No event</option>
              <option v-for="ev in linkableEvents" :key="ev.id" :value="ev.id">
                {{ ev.name ?? ev.title }}
              </option>
            </select>
          </div>

          <p
            v-if="shoutoutError"
            class="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {{ shoutoutError }}
          </p>

          <p class="mt-2 text-right text-xs text-fg-muted">{{ shoutoutInput.length }}/280</p>
        </div>
      </div>

      <!-- Rating & Rank Row -->
      <div class="grid gap-4 sm:grid-cols-2">
        <!-- Rating Card -->
        <div class="rounded-xl bg-surface p-5 shadow-card">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-xs font-medium uppercase tracking-wider text-fg-muted">RATING</span>
            <div class="flex gap-1">
              <button
                class="rounded-md px-3 py-1 text-xs font-medium"
                :class="
                  activeRatingType === 'singles'
                    ? 'bg-primary/20 text-primary'
                    : 'text-fg-muted hover:bg-surface-2'
                "
                @click="activeRatingType = 'singles'"
              >
                Singles
              </button>
              <button
                class="rounded-md px-3 py-1 text-xs font-medium"
                :class="
                  activeRatingType === 'doubles'
                    ? 'bg-primary/20 text-primary'
                    : 'text-fg-muted hover:bg-surface-2'
                "
                @click="activeRatingType = 'doubles'"
              >
                Doubles
              </button>
            </div>
          </div>
          <div class="flex items-baseline gap-3">
            <span class="text-5xl font-bold text-fg">
              {{ displayRating > 0 ? displayRating.toFixed(2) : '—' }}
            </span>
            <span class="text-lg text-primary">{{ ratingTier }}</span>
          </div>
        </div>

        <!-- Rank Card -->
        <div class="rounded-xl bg-surface p-5 shadow-card">
          <div class="mb-3">
            <span class="text-xs font-medium uppercase tracking-wider text-fg-muted">RANK</span>
          </div>
          <div v-if="myRankEntry" class="flex items-baseline gap-3">
            <span class="text-5xl font-bold text-fg">#{{ myRankEntry.rank }}</span>
            <div>
              <p class="text-sm text-fg-secondary">
                {{ myProfile?.city || myProfile?.province || 'Overall' }}
              </p>
              <p class="text-xs text-primary">of top {{ rankingData?.data.length }} tracked</p>
            </div>
          </div>
          <div v-else class="flex items-center gap-3">
            <span class="text-3xl font-bold text-fg-muted">Unranked</span>
          </div>
        </div>
      </div>

      <!-- Rating Progress -->
      <div class="rounded-card border border-border bg-surface p-5 shadow-card">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span class="text-body-2 font-medium text-fg">Rating Progress</span>
          <UiSegmented
            v-model="chartRange"
            size="sm"
            label="Chart range"
            :items="RANGES.map((r) => ({ value: r.value, label: r.label }))"
          />
        </div>
        <UiLineChart
          :points="chartPoints"
          :label="`${activeRatingType} rating over the selected range`"
          empty-message="No rating history yet — play a verified match to start tracking progress."
        />
      </div>

      <!-- Pending Actions -->
      <div v-if="pendingActions?.data.total" class="rounded-xl bg-surface p-5 shadow-card">
        <span class="text-sm font-medium text-fg-secondary"
          >Pending Actions ({{ pendingActions.data.total }})</span
        >
        <div class="mt-3 space-y-2">
          <NuxtLink
            v-for="v in pendingActions.data.pending_verifications"
            :key="v.match_id"
            :to="`/matches/${v.match_id}`"
            class="flex items-center gap-3 rounded-lg bg-surface-2/50 p-3 hover:bg-surface-2"
          >
            <span class="text-base">⚠️</span>
            <span class="flex-1 text-sm text-fg-secondary">
              A {{ v.match_type }} match is waiting for your verification
            </span>
          </NuxtLink>
          <NuxtLink
            v-for="m in pendingActions.data.pending_memberships"
            :key="m.club_id"
            :to="`/clubs/${m.club_id}`"
            class="flex items-center gap-3 rounded-lg bg-surface-2/50 p-3 hover:bg-surface-2"
          >
            <span class="text-base">📩</span>
            <span class="flex-1 text-sm text-fg-secondary">
              Your request to join {{ m.club_name }} is pending approval
            </span>
          </NuxtLink>
        </div>
      </div>

      <!-- Recent Matches -->
      <div class="rounded-xl bg-surface p-5 shadow-card">
        <div class="mb-4 flex items-center justify-between">
          <span class="text-sm font-medium text-fg-secondary">My Recent Matches</span>
        </div>
        <div v-if="!allRecentMatches.length" class="py-4 text-center text-sm text-fg-muted">
          No matches yet —
          <NuxtLink to="/events" class="text-primary hover:underline">find an event</NuxtLink> to
          get started.
        </div>
        <div v-else class="space-y-2">
          <NuxtLink
            v-for="match in allRecentMatches"
            :key="match.id"
            :to="`/matches/${match.id}`"
            class="flex items-center gap-3 rounded-lg bg-surface-2/50 p-3 hover:bg-surface-2"
          >
            <span class="text-base">
              {{ didIWin(match) === true ? '🏆' : didIWin(match) === false ? '❌' : '🎾' }}
            </span>
            <span class="flex-1 text-sm text-fg-secondary">
              {{ didIWin(match) === true ? 'Won' : didIWin(match) === false ? 'Lost' : 'Played' }}
              vs {{ getOpponentNames(match) }}
              <span class="text-fg-muted">{{ formatScore(match) }}</span>
            </span>
            <!-- What the match cost or earned. Green up, red down, and nothing
                 at all for a match that did not affect rating — showing 0 there
                 would say "you gained nothing", which is a different claim. -->
            <span
              v-if="match.rating_delta !== null && match.rating_delta !== undefined"
              class="font-mono text-xs font-bold tabular-nums"
              :class="match.rating_delta >= 0 ? 'text-success' : 'text-danger'"
            >
              {{ match.rating_delta >= 0 ? '+' : '' }}{{ match.rating_delta.toFixed(2) }}
            </span>
            <span class="text-xs text-fg-muted">{{ formatRelativeTime(match.played_at) }}</span>
          </NuxtLink>

          <button
            v-if="!matchesEnd"
            type="button"
            class="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-fg-secondary transition-colors hover:border-border-strong hover:text-fg disabled:opacity-60"
            :disabled="loadingMatches"
            @click="loadMoreMatches"
          >
            {{ loadingMatches ? 'Loading…' : 'Show more matches' }}
          </button>
        </div>
      </div>

      <!-- Upcoming Events -->
      <div class="rounded-xl bg-surface p-5 shadow-card">
        <div class="mb-4 flex items-center justify-between">
          <span class="text-sm font-medium text-fg-secondary">My Upcoming Events</span>
          <NuxtLink to="/events" class="text-xs text-primary hover:underline">Find more →</NuxtLink>
        </div>
        <div v-if="!allUpcomingEvents.length" class="py-4 text-center text-sm text-fg-muted">
          You're not registered for any upcoming events.
        </div>
        <div v-else class="space-y-2">
          <NuxtLink
            v-for="entry in allUpcomingEvents"
            :key="entry.event.id"
            :to="`/events/${entry.event.id}`"
            class="flex items-center gap-3 rounded-lg bg-surface-2/50 p-3 hover:bg-surface-2"
          >
            <span class="text-base">📅</span>
            <span class="flex-1 text-sm text-fg-secondary">
              {{ entry.event.name }}
              <span class="text-fg-muted">{{
                [entry.event.venue, entry.event.city].filter(Boolean).join(', ')
              }}</span>
            </span>
            <span class="text-xs text-fg-muted">{{ formatEventDate(entry.event.start_date) }}</span>
          </NuxtLink>

          <button
            v-if="!eventsEnd"
            type="button"
            class="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-fg-secondary transition-colors hover:border-border-strong hover:text-fg disabled:opacity-60"
            :disabled="loadingEvents"
            @click="loadMoreEvents"
          >
            {{ loadingEvents ? 'Loading…' : 'Show more events' }}
          </button>
        </div>
      </div>

      <!-- My Clubs -->
      <div class="rounded-xl bg-surface p-5 shadow-card">
        <div class="mb-4 flex items-center justify-between">
          <span class="text-sm font-medium text-fg-secondary">My Clubs</span>
          <NuxtLink to="/my-clubs" class="text-xs text-primary hover:underline"
            >View all →</NuxtLink
          >
        </div>
        <div v-if="!myActiveClubs.length" class="py-4 text-center text-sm text-fg-muted">
          You haven't joined a club yet.
        </div>
        <div v-else class="space-y-2">
          <NuxtLink
            v-for="membership in myActiveClubs"
            :key="membership.club.id"
            :to="`/clubs/${membership.club.id}`"
            class="flex items-center gap-3 rounded-lg bg-surface-2/50 p-3 hover:bg-surface-2"
          >
            <span class="text-base">🏸</span>
            <span class="flex-1 text-sm text-fg-secondary">{{ membership.club.name }}</span>
            <span class="text-xs capitalize text-fg-muted">{{
              membership.role.toLowerCase()
            }}</span>
          </NuxtLink>
        </div>
      </div>

      <!-- Badge Showcase -->
      <div class="rounded-xl bg-surface p-5 shadow-card">
        <div class="mb-4 flex items-center justify-between">
          <span class="text-sm font-medium text-fg-secondary">My Badge</span>
          <button
            class="text-xs text-primary hover:underline"
            @click="badgeSelectorOpen = !badgeSelectorOpen"
          >
            {{ badgeSelectorOpen ? 'Cancel' : selectedBadge ? 'Change' : 'Select' }}
          </button>
        </div>

        <!-- Current Badge Display -->
        <div v-if="!badgeSelectorOpen && selectedBadge" class="flex items-center gap-4">
          <span class="text-4xl">{{ selectedBadge.icon }}</span>
          <div>
            <p class="font-medium text-fg">{{ selectedBadge.name }}</p>
            <p class="text-sm text-fg-muted">{{ selectedBadge.description }}</p>
          </div>
        </div>

        <!-- No Badge Selected -->
        <div v-else-if="!badgeSelectorOpen" class="py-2 text-center text-sm text-fg-muted">
          Select a badge to display on your profile.
        </div>

        <!-- Badge Selector -->
        <div v-else class="space-y-2">
          <button
            v-if="selectedBadge"
            class="flex w-full items-center gap-3 rounded-lg border border-dashed border-border-strong p-3 text-fg-muted hover:border-primary hover:text-fg"
            :disabled="badgeSaving"
            @click="selectBadge(null)"
          >
            <span class="text-lg">✕</span>
            <span class="text-sm">Remove badge</span>
          </button>
          <button
            v-for="badge in badgeData?.data?.availableBadges"
            :key="badge.id"
            class="flex w-full items-center gap-3 rounded-lg p-3 transition-colors"
            :class="
              badge.id === selectedBadge?.id
                ? 'bg-primary/20 ring-1 ring-primary'
                : 'bg-surface-2/50 hover:bg-surface-2'
            "
            :disabled="badgeSaving"
            @click="selectBadge(badge.id)"
          >
            <span class="text-2xl">{{ badge.icon }}</span>
            <div class="flex-1 text-left">
              <p class="text-sm font-medium text-fg">{{ badge.name }}</p>
              <p class="text-xs text-fg-muted">{{ badge.description }}</p>
            </div>
            <span v-if="badge.id === selectedBadge?.id" class="text-primary">✓</span>
          </button>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NuxtLink
          to="/my-clubs"
          class="flex items-center gap-3 rounded-xl bg-primary p-4 text-on-primary transition-colors hover:bg-primary-hover"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span class="text-sm font-medium">My Clubs</span>
        </NuxtLink>

        <NuxtLink
          to="/rankings"
          class="flex items-center gap-3 rounded-xl bg-surface p-4 transition-colors hover:bg-surface-2 shadow-card hover:shadow-card-hover"
        >
          <svg class="h-5 w-5 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <span class="text-sm font-medium text-fg-secondary">Rankings</span>
        </NuxtLink>

        <NuxtLink
          to="/events"
          class="flex items-center gap-3 rounded-xl bg-surface p-4 transition-colors hover:bg-surface-2 shadow-card hover:shadow-card-hover"
        >
          <svg class="h-5 w-5 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span class="text-sm font-medium text-fg-secondary">Events</span>
        </NuxtLink>

        <NuxtLink
          to="/players"
          class="flex items-center gap-3 rounded-xl bg-surface p-4 transition-colors hover:bg-surface-2 shadow-card hover:shadow-card-hover"
        >
          <svg class="h-5 w-5 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <span class="text-sm font-medium text-fg-secondary">Find Players</span>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
