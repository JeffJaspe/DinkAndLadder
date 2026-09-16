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

/**
 * Mirrors `server/api/v1/players/me/pending-actions.get.ts` exactly.
 *
 * `pending_partner_requests` was missing from this interface and from the page,
 * while `total` on the server has always summed all three lists — so a player
 * with three duo requests and nothing else read "3 waiting on you" above an
 * empty list. A count the page cannot account for is worse than no count.
 */
interface PendingActionsResponse {
  pending_verifications: Array<{ match_id: string; match_type: string; played_at: string }>
  pending_memberships: Array<{ club_id: string; club_name: string }>
  pending_partner_requests: Array<{
    request_id: string
    from_player_id: string
    created_at: string
  }>
  total: number
}

/**
 * A badge this player has earned. Mirrors BadgeDto.
 *
 * This list used to be a hard-coded ten-badge catalogue the API handed to
 * everybody, selectable without any check — so a player could wear "Completed
 * 100+ matches" having played none. It is now only what they hold, and
 * `lockedCount` carries the rest as a link to the gallery rather than as a
 * second copy of it in a dashboard card.
 */
interface BadgeDefinition {
  id: string
  name: string
  icon: string | null
  description: string
  tier: string
  earnedAt: string
}

interface BadgeShowcaseDto {
  playerId: string
  selectedBadgeId: string | null
  updatedAt: string
}

interface BadgeResponse {
  showcase: BadgeShowcaseDto | null
  /** Earned badges only. */
  availableBadges: BadgeDefinition[]
  /** How many earnable badges are still locked. */
  lockedCount: number
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
  singles?: { rating_value: number | null } | null
  doubles?: { rating_value: number | null } | null
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
const { data: ratingsData, pending: ratingsPending } = ratingsQuery

/**
 * A player with a profile but no rating — either an assessment that never
 * persisted, or a SuperAdmin reset so they retake it — has no other route back
 * to the questionnaire from here (only the account switcher sends them). Shown
 * once the ratings request has answered, so it does not flash while loading.
 */
const needsAssessment = computed(
  () =>
    !ratingsPending.value &&
    ratingsData.value != null &&
    ratingsData.value.singles?.rating_value == null
)
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

const allRecentMatches = computed(() => [
  ...(recentMatches.value?.data ?? []),
  ...moreMatches.value
])

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

const badgeError = ref('')

const earnedBadges = computed(() => badgeData.value?.data?.availableBadges ?? [])
const lockedBadgeCount = computed(() => badgeData.value?.data?.lockedCount ?? 0)

async function selectBadge(badgeId: string | null) {
  badgeSaving.value = true
  badgeError.value = ''
  try {
    await $fetch('/api/v1/players/me/badge', {
      method: 'PUT',
      body: { badge_id: badgeId }
    })
    await refreshBadge()
    badgeSelectorOpen.value = false
  } catch (err) {
    // The server re-checks ownership on every write, so this is reachable
    // even from a correct client — a badge can be shown in a list that was
    // fetched before something changed.
    badgeError.value = apiErrorMessage(err, 'Could not update your badge.')
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

/**
 * The NOW band's state. The count drives the weight of the rule that closes the
 * band, so the page reports whether anything needs the reader before a word of
 * it is read.
 */
const pendingTotal = computed(() => pendingActions.value?.data.total ?? 0)
const hasPending = computed(() => pendingTotal.value > 0)

/** Where else to go from here. No submit action: club owners record scores. */
const dashboardLinks: ReadonlyArray<{ to: string; label: string; line: string }> = [
  { to: '/events', label: 'Events', line: 'Open play and tournaments' },
  { to: '/rankings', label: 'Rankings', line: 'Where the ladder stands' },
  { to: '/my-clubs', label: 'My clubs', line: 'Membership and requests' },
  { to: '/players', label: 'Players', line: 'Find someone to play' }
]
</script>
<template>
  <div class="min-h-screen bg-canvas px-4 py-5 lg:px-6 lg:py-6">
    <!--
    Panels, not bare rules.

    The first version of this page drew its structure entirely in lines on the
    canvas: no surface, no elevation, hairlines everywhere. In dark mode that
    works, because the theme's surfaces separate by lightness. In light mode it
    does not: `canvas` #F7F9F8 against `surface` #FFFFFF is 1.06:1, and every
    darker canvas that would make tone readable pushes `primary`, `warning` and
    `fg-muted` under AA (measured). With tone unable to separate anything, the
    lines had to carry the whole page alone — which read pale and skeletal, and
    made the rules themselves feel noisy.

    So separation goes back to where this design system already put it: a real
    surface with a real shadow. Five panels rather than the ten this page used
    to stack, ordered by time and with NOW dominant, so mass carries the
    structure and the rules inside a panel can be quiet again.
  -->
    <div v-if="pending" class="page-shell space-y-5">
      <div class="h-28 animate-pulse rounded-card bg-surface" />
      <div class="h-40 animate-pulse rounded-card bg-surface" />
      <div class="h-40 animate-pulse rounded-card bg-surface" />
    </div>

    <div v-else-if="error" class="page-shell">
      <div class="rounded-card border border-border bg-surface p-6 shadow-card">
        <h1 class="font-display text-heading-2 text-fg">Could not load your dashboard</h1>
        <p class="mt-2 max-w-[52ch] text-body-2 text-fg-secondary">
          Your profile did not come back from the server. Nothing is lost — reloading usually clears
          it.
        </p>
        <button
          class="mt-5 rounded-button bg-primary px-5 py-2.5 text-body-2 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          @click="$router.go(0)"
        >
          Try again
        </button>
      </div>
    </div>

    <div v-else-if="currentUser" class="page-shell space-y-5">
      <SecurityMfaReminder />

      <!-- Sent back to the questionnaire: no rating on file (see needsAssessment). -->
      <section
        v-if="needsAssessment"
        data-testid="assessment-nudge"
        class="flex flex-col gap-3 rounded-card border border-primary/40 bg-primary-soft p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p class="font-medium text-fg">Take the skill assessment</p>
          <p class="mt-0.5 text-body-2 text-fg-secondary">
            You have no rating on file yet. A few quick questions give you a provisional rating so
            your matches can count.
          </p>
        </div>
        <UiButton to="/onboarding?flow=rate-only&redirect=/dashboard">Start</UiButton>
      </section>

      <!-- STANDING. Who you are and where you stand. -->
      <section class="rounded-card border border-border bg-surface p-5 shadow-card sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 class="font-display text-heading-3 text-fg">
              {{ myProfile?.display_name || currentUser.email?.split('@')[0] }}
            </h1>
            <p class="mt-1 text-body-2 text-fg-secondary">
              <template v-if="myRankEntry">
                <span class="font-semibold tabular-nums text-fg">#{{ myRankEntry.rank }}</span>
                in {{ myProfile?.city || myProfile?.province || 'the overall ladder' }}
              </template>
              <template v-else>Not ranked yet</template>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UiSegmented
              v-model="activeRatingType"
              size="sm"
              label="Rating type"
              :items="[
                { value: 'singles', label: 'Singles' },
                { value: 'doubles', label: 'Doubles' }
              ]"
            />
            <button
              class="rounded-button border border-border-strong px-3 py-2 text-body-2 font-medium text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg"
              @click="handleLogout"
            >
              Log out
            </button>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border pt-5">
          <span class="text-stat-lg tabular-nums text-fg">{{
            displayRating > 0 ? displayRating.toFixed(3) : '—'
          }}</span>
          <span class="text-heading-3 font-medium text-primary">{{ ratingTier }}</span>
          <span class="text-body-2 text-fg-muted">{{ activeRatingType }} rating</span>
        </div>
      </section>

      <!-- NOW. The only panel that asks for anything.

           Signature: the panel itself reports the page's state. Anything
           waiting and it takes the warning edge and a filled count; nothing
           waiting and it is an ordinary panel saying so. State is carried by
           the block, which light mode can actually render, rather than by a
           rule weight, which it cannot. -->
      <section
        class="rounded-card border bg-surface p-5 shadow-card transition-colors duration-300 sm:p-6"
        :class="hasPending ? 'border-warning' : 'border-border'"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-heading-2 text-fg">Now</h2>
          <span
            v-if="hasPending"
            class="rounded-pill bg-warning-soft px-3 py-1 text-body-2 font-semibold tabular-nums text-warning"
            aria-live="polite"
          >
            {{ pendingTotal }} waiting on you
          </span>
          <span v-else class="text-body-2 text-fg-muted">Nothing waiting</span>
        </div>

        <p v-if="!hasPending" class="mt-4 max-w-[56ch] text-body-1 text-fg-secondary">
          You are all caught up. Results your opponents confirm show up here, and so does anything a
          club or a partner needs you to answer.
        </p>

        <ul v-else class="mt-4">
          <li v-for="v in pendingActions!.data.pending_verifications" :key="v.match_id">
            <NuxtLink
              :to="`/matches/${v.match_id}`"
              class="group flex items-baseline gap-4 border-t border-border py-3.5 transition-colors first:border-t-0 first:pt-0 hover:text-primary"
            >
              <span
                class="w-24 shrink-0 text-caption font-semibold uppercase tracking-wide text-warning"
                >Verify</span
              >
              <span class="min-w-0 flex-1">
                <span class="block text-body-1 font-medium text-fg group-hover:text-primary"
                  >A {{ v.match_type }} match is waiting for your verification</span
                >
                <span class="block text-body-2 tabular-nums text-fg-muted">{{
                  formatRelativeTime(v.played_at)
                }}</span>
              </span>
              <UiIcon
                name="chevron-right"
                size="h-4 w-4"
                :stroke-width="2"
                class="shrink-0 text-fg-muted"
                aria-hidden="true"
              />
            </NuxtLink>
          </li>
          <li v-for="m in pendingActions!.data.pending_memberships" :key="m.club_id">
            <NuxtLink
              :to="`/clubs/${m.club_id}`"
              class="group flex items-baseline gap-4 border-t border-border py-3.5 transition-colors first:border-t-0 first:pt-0 hover:text-primary"
            >
              <span
                class="w-24 shrink-0 text-caption font-semibold uppercase tracking-wide text-fg-muted"
                >Club</span
              >
              <span class="min-w-0 flex-1">
                <span class="block text-body-1 font-medium text-fg group-hover:text-primary"
                  >Your request to join {{ m.club_name }} is pending approval</span
                >
                <span class="block text-body-2 text-fg-muted">Waiting on the club</span>
              </span>
              <UiIcon
                name="chevron-right"
                size="h-4 w-4"
                :stroke-width="2"
                class="shrink-0 text-fg-muted"
                aria-hidden="true"
              />
            </NuxtLink>
          </li>
          <!-- Duo requests: the third list the server counts. They are answered
               on the community page's partners tab. Omitting them here is what
               produced a count with nothing under it. -->
          <li v-for="r in pendingActions!.data.pending_partner_requests" :key="r.request_id">
            <NuxtLink
              to="/community?tab=partners"
              class="group flex items-baseline gap-4 border-t border-border py-3.5 transition-colors first:border-t-0 first:pt-0 hover:text-primary"
            >
              <span
                class="w-24 shrink-0 text-caption font-semibold uppercase tracking-wide text-warning"
                >Duo</span
              >
              <span class="min-w-0 flex-1">
                <span class="block text-body-1 font-medium text-fg group-hover:text-primary"
                  >A player asked you to partner up</span
                >
                <span class="block text-body-2 tabular-nums text-fg-muted">{{
                  formatRelativeTime(r.created_at)
                }}</span>
              </span>
              <UiIcon
                name="chevron-right"
                size="h-4 w-4"
                :stroke-width="2"
                class="shrink-0 text-fg-muted"
                aria-hidden="true"
              />
            </NuxtLink>
          </li>
        </ul>
      </section>

      <!-- NEXT. What you are registered for. -->
      <section class="rounded-card border border-border bg-surface p-5 shadow-card sm:p-6">
        <div class="flex items-baseline justify-between gap-4">
          <h2 class="font-display text-heading-2 text-fg">Next</h2>
          <NuxtLink
            to="/events"
            class="text-body-2 font-semibold text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
            >Find play</NuxtLink
          >
        </div>

        <p v-if="!allUpcomingEvents.length" class="mt-4 max-w-[56ch] text-body-1 text-fg-secondary">
          You are not registered for anything yet. Open play and tournaments your clubs publish are
          listed under Events.
        </p>

        <ul v-else class="mt-4">
          <li v-for="entry in allUpcomingEvents" :key="entry.event.id">
            <NuxtLink
              :to="`/events/${entry.event.id}`"
              class="group flex items-baseline gap-4 border-t border-border py-3.5 transition-colors first:border-t-0 first:pt-0 hover:text-primary"
            >
              <span class="w-20 shrink-0 text-body-2 font-semibold tabular-nums text-fg">{{
                formatEventDate(entry.event.start_date)
              }}</span>
              <span class="min-w-0 flex-1">
                <span
                  class="block truncate text-body-1 font-medium text-fg group-hover:text-primary"
                  >{{ entry.event.name }}</span
                >
                <span class="block truncate text-body-2 text-fg-muted">{{
                  [entry.event.venue, entry.event.city].filter(Boolean).join(', ') ||
                  'Venue to be announced'
                }}</span>
              </span>
              <span
                class="hidden shrink-0 text-caption font-semibold uppercase tracking-wide text-fg-muted sm:block"
                >{{ entry.registration_status }}</span
              >
            </NuxtLink>
          </li>
        </ul>

        <button
          v-if="allUpcomingEvents.length && !eventsEnd"
          type="button"
          class="mt-4 rounded-button border border-border-strong px-4 py-2 text-body-2 font-medium text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60"
          :disabled="loadingEvents"
          @click="loadMoreEvents"
        >
          {{ loadingEvents ? 'Loading…' : 'Show more' }}
        </button>
      </section>

      <!-- DONE. What happened, and what it did to the number. -->
      <section class="rounded-card border border-border bg-surface p-5 shadow-card sm:p-6">
        <h2 class="font-display text-heading-2 text-fg">Done</h2>

        <div class="mt-4 lg:grid lg:grid-cols-12 lg:gap-8">
          <div class="lg:col-span-7">
            <h3 class="text-caption font-semibold uppercase tracking-widest text-fg-muted">
              Recent matches
            </h3>

            <p v-if="!allRecentMatches.length" class="mt-3 text-body-1 text-fg-secondary">
              No matches yet. Once a club records a result you played in, it lands here with what it
              did to your rating.
            </p>

            <ul v-else class="mt-3">
              <li v-for="match in allRecentMatches" :key="match.id">
                <NuxtLink
                  :to="`/matches/${match.id}`"
                  class="group flex items-baseline gap-4 border-t border-border py-3.5 transition-colors first:border-t-0 first:pt-0 hover:text-primary"
                >
                  <span
                    class="w-12 shrink-0 text-caption font-semibold uppercase tracking-wide"
                    :class="didIWin(match) === true ? 'text-primary' : 'text-fg-muted'"
                    >{{
                      didIWin(match) === true ? 'Won' : didIWin(match) === false ? 'Lost' : 'Played'
                    }}</span
                  >
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-body-1 font-medium text-fg group-hover:text-primary"
                      >{{ getOpponentNames(match) }}</span
                    >
                    <span class="block text-body-2 tabular-nums text-fg-muted"
                      >{{ formatScore(match) }} · {{ formatRelativeTime(match.played_at) }}</span
                    >
                  </span>
                  <!-- What the match cost or earned. Green up, red down, and
                       nothing at all for a match that did not affect rating —
                       showing 0 there would say "you gained nothing", which is a
                       different claim. -->
                  <span
                    v-if="match.rating_delta !== null && match.rating_delta !== undefined"
                    class="shrink-0 text-body-2 font-semibold tabular-nums"
                    :class="match.rating_delta >= 0 ? 'text-success' : 'text-danger'"
                  >
                    {{ match.rating_delta >= 0 ? '+' : '' }}{{ match.rating_delta.toFixed(3) }}
                  </span>
                </NuxtLink>
              </li>
            </ul>

            <button
              v-if="allRecentMatches.length && !matchesEnd"
              type="button"
              class="mt-4 rounded-button border border-border-strong px-4 py-2 text-body-2 font-medium text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60"
              :disabled="loadingMatches"
              @click="loadMoreMatches"
            >
              {{ loadingMatches ? 'Loading…' : 'Show more' }}
            </button>
          </div>

          <div class="mt-6 lg:col-span-5 lg:mt-0">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-caption font-semibold uppercase tracking-widest text-fg-muted">
                Rating over time
              </h3>
              <UiSegmented
                v-model="chartRange"
                size="sm"
                label="Chart range"
                :items="RANGES.map((r) => ({ value: r.value, label: r.label }))"
              />
            </div>
            <div class="mt-3 rounded-card bg-surface-2 p-4">
              <UiLineChart
                :points="chartPoints"
                :label="`${activeRatingType} rating over the selected range`"
                empty-message="No rating history yet. Your first confirmed result starts the line."
              />
            </div>
          </div>
        </div>
      </section>

      <!-- Identity rather than schedule, so it sits below the day. -->
      <section class="rounded-card border border-border bg-surface p-5 shadow-card sm:p-6">
        <div class="lg:grid lg:grid-cols-12 lg:gap-8">
          <div class="lg:col-span-5">
            <div class="flex items-baseline justify-between gap-4">
              <h2 class="font-display text-heading-3 text-fg">My clubs</h2>
              <NuxtLink
                to="/my-clubs"
                class="text-body-2 font-semibold text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
                >All</NuxtLink
              >
            </div>

            <p v-if="!myActiveClubs.length" class="mt-3 text-body-2 text-fg-secondary">
              You have not joined a club yet. Clubs run the open play and tournaments you can enter.
            </p>

            <ul v-else class="mt-3">
              <li v-for="membership in myActiveClubs" :key="membership.club.id">
                <NuxtLink
                  :to="`/clubs/${membership.club.id}`"
                  class="group flex items-baseline gap-4 border-t border-border py-3 transition-colors first:border-t-0 first:pt-0 hover:text-primary"
                >
                  <span
                    class="min-w-0 flex-1 truncate text-body-1 text-fg group-hover:text-primary"
                    >{{ membership.club.name }}</span
                  >
                  <span
                    class="shrink-0 text-caption font-semibold uppercase tracking-wide text-fg-muted"
                    >{{ membership.role.toLowerCase() }}</span
                  >
                </NuxtLink>
              </li>
            </ul>
          </div>

          <div class="mt-8 lg:col-span-7 lg:mt-0">
            <div class="flex items-baseline justify-between gap-4">
              <h2 class="font-display text-heading-3 text-fg">Shout-out</h2>
              <button
                v-if="myShoutout?.data && !shoutoutEditing"
                class="text-body-2 font-semibold text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
                @click="startEditingShoutout"
              >
                Edit
              </button>
            </div>

            <div
              v-if="myShoutout?.data && !shoutoutEditing"
              class="mt-3 rounded-card bg-surface-2 p-4"
            >
              <p class="text-body-1 text-fg">{{ myShoutout.data.message }}</p>
              <p class="mt-2 flex flex-wrap items-center gap-x-3 text-body-2 text-fg-muted">
                <span>Posted {{ formatRelativeTime(myShoutout.data.created_at) }}</span>
                <span v-if="shoutoutExpiresIn" class="tabular-nums">{{ shoutoutExpiresIn }}</span>
              </p>
            </div>

            <div v-else-if="shoutoutEditing || !myShoutout?.data" class="mt-3">
              <label for="shoutout-message" class="sr-only">Your shout-out</label>
              <div class="flex flex-wrap gap-2">
                <input
                  id="shoutout-message"
                  v-model="shoutoutInput"
                  type="text"
                  placeholder="Looking for a game?"
                  maxlength="280"
                  class="min-w-0 flex-1 rounded-button border border-border-strong bg-surface px-3 py-2 text-body-2 text-fg placeholder:text-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  @keyup.enter="saveShoutout"
                />
                <button
                  class="rounded-button bg-primary px-4 py-2 text-body-2 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                  :disabled="shoutoutSaving || !shoutoutInput.trim()"
                  @click="saveShoutout"
                >
                  {{ shoutoutSaving ? 'Saving…' : shoutoutEditing ? 'Update' : 'Post' }}
                </button>
                <button
                  v-if="shoutoutEditing"
                  class="rounded-button border border-border-strong px-3 py-2 text-body-2 font-medium text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg"
                  @click="shoutoutEditing = false"
                >
                  Cancel
                </button>
              </div>

              <div v-if="!myShoutout?.data" class="mt-3 flex flex-wrap gap-2">
                <button
                  v-for="example in shoutoutExamples"
                  :key="example"
                  class="rounded-pill border border-border-strong px-3 py-1 text-caption text-fg-secondary transition-colors hover:border-primary hover:text-fg"
                  @click="shoutoutInput = example"
                >
                  {{ example }}
                </button>
              </div>

              <!-- Optional event link. Only rendered when there is something to
                   attach — an empty select is just a puzzle. -->
              <div v-if="linkableEvents.length" class="mt-3">
                <label for="shoutout-event" class="mb-1 block text-caption text-fg-muted">
                  Link an event (optional)
                </label>
                <select
                  id="shoutout-event"
                  v-model="shoutoutEventId"
                  class="w-full rounded-button border border-border-strong bg-surface px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">No event</option>
                  <option v-for="ev in linkableEvents" :key="ev.id" :value="ev.id">
                    {{ ev.name ?? ev.title }}
                  </option>
                </select>
              </div>

              <p v-if="shoutoutError" class="mt-2 text-body-2 text-danger">{{ shoutoutError }}</p>

              <p class="mt-2 text-right text-caption tabular-nums text-fg-muted">
                {{ shoutoutInput.length }}/280
              </p>
            </div>

            <div class="mt-6 flex items-baseline justify-between gap-4">
              <h2 class="font-display text-heading-3 text-fg">My badge</h2>
              <NuxtLink
                v-if="!earnedBadges.length"
                to="/achievements"
                class="text-body-2 font-semibold text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
              >
                See badges
              </NuxtLink>
              <button
                v-else
                class="text-body-2 font-semibold text-fg underline decoration-border-strong underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
                @click="badgeSelectorOpen = !badgeSelectorOpen"
              >
                {{ badgeSelectorOpen ? 'Cancel' : selectedBadge ? 'Change' : 'Select' }}
              </button>
            </div>

            <div
              v-if="!badgeSelectorOpen && selectedBadge"
              class="mt-3 flex items-center gap-4 rounded-card bg-surface-2 p-4"
            >
              <!-- The glyph is the badge's own data, not an icon system. -->
              <span class="text-3xl" aria-hidden="true">{{ selectedBadge.icon }}</span>
              <div>
                <p class="text-body-1 font-medium text-fg">{{ selectedBadge.name }}</p>
                <p class="text-body-2 text-fg-secondary">{{ selectedBadge.description }}</p>
              </div>
            </div>

            <p v-else-if="!badgeSelectorOpen" class="mt-3 text-body-2 text-fg-secondary">
              <template v-if="earnedBadges.length">Pick a badge to show on your profile.</template>
              <template v-else>
                No badges yet. They are earned from your record — your first arrives the day an
                organiser records a match you played.
              </template>
            </p>

            <ul v-else class="mt-3">
              <li v-if="selectedBadge">
                <button
                  class="flex w-full items-center gap-3 border-t border-border py-3 text-left text-body-2 text-fg-secondary transition-colors first:border-t-0 first:pt-0 hover:text-fg disabled:opacity-60"
                  :disabled="badgeSaving"
                  @click="selectBadge(null)"
                >
                  <UiIcon name="x" size="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                  Remove badge
                </button>
              </li>
              <li v-for="badge in earnedBadges" :key="badge.id">
                <button
                  class="flex w-full items-center gap-3 border-t border-border py-3 text-left transition-colors first:border-t-0 first:pt-0 disabled:opacity-60"
                  :disabled="badgeSaving"
                  :aria-pressed="badge.id === selectedBadge?.id"
                  @click="selectBadge(badge.id)"
                >
                  <span class="text-xl" aria-hidden="true">{{ badge.icon }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-body-2 font-medium text-fg">{{ badge.name }}</span>
                    <span class="block text-caption text-fg-muted">{{ badge.description }}</span>
                  </span>
                  <UiIcon
                    v-if="badge.id === selectedBadge?.id"
                    name="check"
                    size="h-4 w-4"
                    :stroke-width="2.4"
                    class="shrink-0 text-primary"
                    aria-hidden="true"
                  />
                </button>
              </li>

              <!-- What is still locked stays a count and a link. The gallery
                   is the surface that shows each locked badge and what it
                   takes; repeating that inside a dashboard card would bury
                   the badges the player can actually use right now. -->
              <li v-if="lockedBadgeCount">
                <NuxtLink
                  to="/achievements"
                  class="flex w-full items-center gap-3 border-t border-border py-3 text-left text-body-2 text-fg-secondary transition-colors first:border-t-0 first:pt-0 hover:text-primary"
                >
                  <UiIcon name="lock" size="h-4 w-4" :stroke-width="2" aria-hidden="true" />
                  <span class="min-w-0 flex-1">
                    <span class="tabular-nums">{{ lockedBadgeCount }}</span>
                    more to earn — see what each one takes
                  </span>
                  <UiIcon
                    name="chevron-right"
                    size="h-4 w-4"
                    :stroke-width="2"
                    class="shrink-0"
                    aria-hidden="true"
                  />
                </NuxtLink>
              </li>
            </ul>

            <p v-if="badgeError" role="alert" class="mt-3 text-body-2 text-danger">
              {{ badgeError }}
            </p>
          </div>
        </div>
      </section>

      <!-- Where else to go. -->
      <nav aria-label="Go to" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink
          v-for="item in dashboardLinks"
          :key="item.to"
          :to="item.to"
          class="group rounded-card border border-border bg-surface p-4 shadow-card transition-shadow hover:shadow-card-hover"
        >
          <span class="block text-body-1 font-medium text-fg group-hover:text-primary">{{
            item.label
          }}</span>
          <span class="mt-0.5 block text-body-2 text-fg-muted">{{ item.line }}</span>
        </NuxtLink>
      </nav>
    </div>
  </div>
</template>
