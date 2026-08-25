<script setup lang="ts">
import type {
  EventDto,
  EventQueueDto,
  EventRegistrationDto
} from '~/server/domains/event/dto/event.dto'
import type { TournamentDto } from '~/server/domains/event/dto/tournament.dto'
import type {
  MatchListItemDto,
  MatchListParticipantDto
} from '~/server/domains/match/dto/match-join-row.dto'
import type { PartnerDto } from '~/server/domains/partnership/dto/partnership.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

interface TournamentsResponse {
  tournaments: TournamentDto[]
}

const route = useRoute()
const eventId = route.params.eventId as string
const user = useSupabaseUser()
const { isClubMode } = useAccountMode()

/**
 * Players, not Info.
 *
 * Info opened by default while carrying almost nothing — it rendered only a
 * Tournaments card, a Record Match link or a queue blurb, each behind its own
 * condition, so a plain published event opened on a blank panel. Who is playing
 * is what people come to a public event page to see.
 */
const activeTab = ref<'info' | 'matches' | 'players' | 'rankings' | 'queue'>('players')

interface EventRankingEntry {
  rank: number
  player_id: string
  display_name: string
  matches_played: number
  wins: number
  losses: number
}

const {
  data: event,
  pending: eventPending,
  error: eventError,
  refresh: refreshEvent
} = await useFetch<EventDto>(`/api/v1/events/${eventId}`)

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')

const { data: tournamentsData, pending: tournamentsPending } = await useFetch<TournamentsResponse>(
  `/api/v1/events/${eventId}/tournaments`
)

/**
 * A tournament event is one tournament with categories under it.
 *
 * The middle level is no longer something an organiser builds: `createEvent`
 * makes the tournament alongside the event, so this page IS the tournament
 * header and the categories sit directly beneath it. An event carrying more
 * than one tournament row predates that and renders its first.
 */
const isTournament = computed(() => event.value?.event_type === 'tournament')
const primaryTournament = computed(() => tournamentsData.value?.tournaments?.[0] ?? null)

const {
  data: registrationsData,
  pending: registrationsPending,
  refresh: refreshRegistrations
} = await useFetch<{ data: EventRegistrationDto[] }>(`/api/v1/events/${eventId}/registrations`)

const { data: matchesData, pending: matchesPending } = await useFetch<{ data: MatchListItemDto[] }>(
  `/api/v1/events/${eventId}/matches`
)

const { data: rankingsData, pending: rankingsPending } = await useFetch<{
  data: EventRankingEntry[]
}>(`/api/v1/events/${eventId}/rankings`)

const {
  data: queueData,
  pending: queuePending,
  refresh: refreshQueue
} = await useFetch<{ data: EventQueueDto[] }>(`/api/v1/events/${eventId}/queue`)

const myRegistration = computed(() => {
  if (!myProfile.value || !registrationsData.value?.data) return null
  return registrationsData.value.data.find(
    (r) => r.player_id === myProfile.value!.id && r.status !== 'withdrawn'
  )
})

const isRegistered = computed(() => !!myRegistration.value)

/** Ownership only. Almost nothing should branch on this directly — see below. */
const isOrganizer = computed(
  () =>
    !!myProfile.value && !!event.value && event.value.created_by_player_id === myProfile.value.id
)

/**
 * The gate every organiser control hangs off.
 *
 * Ownership alone is not enough: running an event is club-mode work. In player
 * mode the owner sees exactly what any other player sees — register, the player
 * list, the bracket, the matches — and no way to publish, edit, delete, add a
 * tournament, or drive the queue. That is why the participant branches below
 * test `!canManageEvent` rather than `!isOrganizer`: an owner in player mode is,
 * for every purpose on this screen, a participant.
 */
const canManageEvent = computed(() => isOrganizer.value && isClubMode.value)

/**
 * A draft is unpublished club work, so it has no place in the player-mode UI.
 * The organiser is not locked out — switching to club mode reveals it — and no
 * other viewer could load a draft anyway, since `events_select_public` filters
 * them out server-side. This only stops an owner's own draft from appearing
 * while they are wearing the player hat.
 */
const draftHiddenFromPlayer = computed(() => event.value?.status === 'draft' && !isClubMode.value)

const myQueueEntry = computed(() => {
  if (!myProfile.value || !queueData.value?.data) return null
  return queueData.value.data.find((q) => q.player_id === myProfile.value!.id) ?? null
})

const waitingEntries = computed(
  () => queueData.value?.data.filter((q) => q.status === 'waiting') ?? []
)
const activeEntries = computed(
  () => queueData.value?.data.filter((q) => q.status !== 'waiting') ?? []
)

const joinMatchType = ref<'singles' | 'doubles'>('singles')
const joinPartnerId = ref('')
const joiningQueue = ref(false)
const leavingQueue = ref(false)
const queueError = ref('')

const availablePartners = computed(() => {
  if (!registrationsData.value?.data) return []
  return registrationsData.value.data.filter(
    (r) => r.status !== 'withdrawn' && r.player_id !== myProfile.value?.id
  )
})

/**
 * The reader's default duo, used only to pre-select the partner field below.
 *
 * server: false because this is a signed-in-only preference that has no
 * bearing on the public render of the page.
 */
const { data: myPartnersData } = await useFetch<{ data: PartnerDto[] }>(
  '/api/v1/players/me/partners',
  { server: false, default: () => ({ data: [] }) }
)

const defaultPartnerId = computed(
  () => myPartnersData.value?.data.find((partner) => partner.is_default)?.player_id ?? null
)

/**
 * Pre-select the duo, but only if they are actually registered for this event —
 * a partner who is not on the list cannot be queued with, and pre-filling a
 * name the server will reject is worse than leaving the field empty.
 *
 * Only ever fills a blank field: once the reader picks someone, that choice
 * stands even if the partner list reloads underneath them.
 */
watch(
  [joinMatchType, defaultPartnerId, availablePartners],
  () => {
    if (joinMatchType.value !== 'doubles' || joinPartnerId.value) return
    const duo = defaultPartnerId.value
    if (duo && availablePartners.value.some((r) => r.player_id === duo)) {
      joinPartnerId.value = duo
    }
  },
  { immediate: true }
)

async function handleJoinQueue() {
  queueError.value = ''
  if (joinMatchType.value === 'doubles' && !joinPartnerId.value) {
    queueError.value = 'Select a partner to join as a doubles pair.'
    return
  }
  joiningQueue.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/queue/join`, {
      method: 'POST',
      body: {
        match_type: joinMatchType.value,
        partner_id: joinMatchType.value === 'doubles' ? joinPartnerId.value : null
      }
    })
    await refreshQueue()
  } catch (err) {
    queueError.value = apiErrorMessage(err, 'Failed to join the queue.')
  } finally {
    joiningQueue.value = false
  }
}

async function handleLeaveQueue() {
  leavingQueue.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/queue/leave`, { method: 'POST' })
    await refreshQueue()
  } catch (err) {
    queueError.value = apiErrorMessage(err, 'Failed to leave the queue.')
  } finally {
    leavingQueue.value = false
  }
}

const selectedEntry1 = ref('')
const selectedEntry2 = ref('')
const matchCourtNumber = ref('')
const matchingQueue = ref(false)
/** The hand-pick pair is the exception now, so it starts collapsed. */
const showManualPick = ref(false)

/**
 * "Match next" names the pair before it is pressed, so the organiser can see
 * whether the fair answer is the right one before committing to it.
 *
 * Same-format only: singles cannot be paired against doubles, and the longest
 * wait decides which format goes on next. Mirrors `matchNextPair`, which is
 * the authority — the server re-reads the queue and picks again.
 */
const nextPair = computed(() => {
  const [first] = waitingEntries.value
  if (!first) return null
  const second = waitingEntries.value.find(
    (entry) => entry.id !== first.id && entry.match_type === first.match_type
  )
  return second ? { first, second } : null
})

function entryLabel(entry: EventQueueDto): string {
  const name = entry.player?.display_name ?? 'Unknown player'
  return entry.partner ? `${name} & ${entry.partner.display_name}` : name
}

/**
 * How long an entry has been waiting, from `joined_at`. Minutes until an hour,
 * because "73m" stops being readable long before it stops being accurate.
 */
function waitedFor(joinedAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(joinedAt).getTime()) / 60000))
  if (minutes < 1) return 'just joined'
  if (minutes < 60) return `${minutes}m waiting`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m waiting` : `${hours}h waiting`
}

// Ticks so the wait times do not freeze at whatever they were when the tab
// was opened. A minute is the smallest unit shown, so a minute is the interval.
const clockNow = ref(Date.now())
onMounted(() => {
  const timer = window.setInterval(() => (clockNow.value = Date.now()), 60_000)
  onBeforeUnmount(() => window.clearInterval(timer))
})

async function handleMatchNextPair() {
  queueError.value = ''
  if (!matchCourtNumber.value) {
    queueError.value = 'Choose a court number first.'
    return
  }
  matchingQueue.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/queue/match-next`, {
      method: 'POST',
      body: { court_number: Number(matchCourtNumber.value) }
    })
    matchCourtNumber.value = ''
    await refreshQueue()
  } catch (err) {
    queueError.value = apiErrorMessage(err, 'Could not match the next pair.')
  } finally {
    matchingQueue.value = false
  }
}

async function handleMatchEntries() {
  queueError.value = ''
  if (!selectedEntry1.value || !selectedEntry2.value || !matchCourtNumber.value) {
    queueError.value = 'Select two waiting players and a court number.'
    return
  }
  matchingQueue.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/queue/match`, {
      method: 'POST',
      body: {
        queue_id_1: selectedEntry1.value,
        queue_id_2: selectedEntry2.value,
        court_number: Number(matchCourtNumber.value)
      }
    })
    selectedEntry1.value = ''
    selectedEntry2.value = ''
    matchCourtNumber.value = ''
    await refreshQueue()
  } catch (err) {
    queueError.value = apiErrorMessage(err, 'Failed to match these players.')
  } finally {
    matchingQueue.value = false
  }
}

async function handleSkipEntry(queueId: string) {
  queueError.value = ''
  try {
    await $fetch(`/api/v1/events/${eventId}/queue/skip`, {
      method: 'POST',
      body: { queue_id: queueId }
    })
    await refreshQueue()
  } catch (err) {
    queueError.value = apiErrorMessage(err, 'Failed to skip this player.')
  }
}

const registering = ref(false)
const withdrawing = ref(false)
const checkingIn = ref(false)

/**
 * Confirmations run through `UiModal`, not `window.confirm`. The browser
 * dialog is unthemed and untranslatable, it ignores the design tokens the rest
 * of the app is built on, and it blocks the tab while it is up. Failures are
 * toasts for the same reason `alert()` is gone.
 */
const withdrawOpen = ref(false)
const publishOpen = ref(false)
const deleteOpen = ref(false)

async function handleRegister() {
  if (!user.value) {
    await navigateTo('/login')
    return
  }
  registering.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/register`, { method: 'POST' })
    await refreshRegistrations()
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not register for the event.'))
  } finally {
    registering.value = false
  }
}

async function handleWithdraw() {
  withdrawing.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/withdraw`, { method: 'POST' })
    await refreshRegistrations()
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not withdraw from the event.'))
  } finally {
    withdrawing.value = false
    withdrawOpen.value = false
  }
}

async function handleCheckIn() {
  checkingIn.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/check-in`, { method: 'POST' })
    await refreshRegistrations()
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not check you in.'))
  } finally {
    checkingIn.value = false
  }
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-surface-3', text: 'text-fg-muted' },
  published: { bg: 'bg-primary/20', text: 'text-primary' },
  active: { bg: 'bg-primary/20', text: 'text-primary' },
  open: { bg: 'bg-primary/20', text: 'text-primary' },
  in_progress: { bg: 'bg-primary/20', text: 'text-primary' },
  completed: { bg: 'bg-accent/20', text: 'text-accent' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' }
}

const eventTypeLabels: Record<string, string> = {
  open_casual: 'Open Casual',
  open_ranked: 'Open Ranked',
  club_casual: 'Club Casual',
  club_ranked: 'Club Ranked',
  tournament: 'Tournament'
}

/**
 * Empty when the event carries no start time, which is every event created
 * before 028-event-time and every one where the organiser left it blank — the
 * date alone still renders in that case.
 */
const timeLabel = computed(() =>
  formatEventTimeRange(event.value?.start_time, event.value?.end_time)
)

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const startStr = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endStr = endDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
  if (startStr === endStr.replace(/, \d{4}$/, '')) {
    return endStr
  }
  return `${startStr} - ${endStr}`
}

function formatScore(scores: { team1_score: number; team2_score: number }[]): string {
  return scores.map((s) => `${s.team1_score}-${s.team2_score}`).join(', ')
}

/**
 * Inline description editing.
 *
 * PATCH /api/v1/events/:id has accepted `description` since the event domain
 * landed, but nothing in the UI ever called it, so whatever was typed at
 * creation was final. Gated on canManageEvent, not isOrganizer: editing an
 * event is club-mode work, same as publishing and deleting.
 */
const editingDescription = ref(false)
const descriptionDraft = ref('')
const savingDescription = ref(false)
const descriptionError = ref('')
const toast = useToast()

function startEditDescription() {
  descriptionDraft.value = event.value?.description ?? ''
  descriptionError.value = ''
  editingDescription.value = true
}

function cancelEditDescription() {
  editingDescription.value = false
  descriptionError.value = ''
}

async function saveDescription() {
  savingDescription.value = true
  descriptionError.value = ''
  try {
    const trimmed = descriptionDraft.value.trim()
    await $fetch(`/api/v1/events/${eventId}`, {
      method: 'PATCH',
      // Empty clears the field rather than storing an empty string, so the
      // "no description yet" branch renders instead of a blank paragraph.
      body: { description: trimmed || null }
    })
    await refreshEvent()
    editingDescription.value = false
    toast.success('Event details updated.')
  } catch (err) {
    descriptionError.value = apiErrorMessage(err, 'Could not save the event details.')
  } finally {
    savingDescription.value = false
  }
}

const publishing = ref(false)

async function handlePublishEvent() {
  publishing.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/publish`, { method: 'POST' })
    await refreshEvent()
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not publish the event.'))
  } finally {
    publishing.value = false
    publishOpen.value = false
  }
}

// Deleting is draft-only and irreversible, so it asks twice as loudly as
// publishing does. The server enforces the same rule regardless — a published
// event, or a draft with players attached, is refused there.
const deleting = ref(false)

async function handleDeleteEvent() {
  deleting.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}`, { method: 'DELETE' })
    await navigateTo('/events')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not delete the event.'))
  } finally {
    deleting.value = false
    deleteOpen.value = false
  }
}

/**
 * Open play fills against the event's own capacity, so the header can say how
 * many more are needed rather than only how many have joined.
 */
const registeredCount = computed(() => registrationsData.value?.data.length ?? 0)
const placesRemaining = computed(() => {
  const capacity = event.value?.max_participants
  if (!capacity) return null
  return Math.max(0, capacity - registeredCount.value)
})
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <!-- Loading -->
      <div v-if="eventPending" class="space-y-4">
        <div class="h-36 animate-pulse rounded-xl bg-surface" />
        <div class="h-48 animate-pulse rounded-xl bg-surface" />
      </div>

      <!-- Error -->
      <div v-else-if="eventError" class="rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">Could not load event.</p>
        <NuxtLink to="/events" class="mt-4 inline-block text-sm text-primary hover:underline">
          Back to events
        </NuxtLink>
      </div>

      <!-- A draft reached in player mode. Not an error and not a permission
           failure — the viewer may well own it — so it says what the state is
           and how to get to it, rather than pretending the event is missing. -->
      <div
        v-else-if="draftHiddenFromPlayer"
        class="rounded-xl bg-surface p-8 text-center shadow-card"
      >
        <h1 class="text-lg font-semibold text-fg">This event is still a draft</h1>
        <p class="mx-auto mt-2 max-w-md text-sm text-fg-muted">
          Drafts live in club mode. Switch to the club that owns this event to finish setting it up
          and make it visible to players.
        </p>
        <NuxtLink to="/events" class="mt-4 inline-block text-sm text-primary hover:underline">
          Back to events
        </NuxtLink>
      </div>

      <template v-else-if="event">
        <!-- Event Header -->
        <div class="mb-6 rounded-xl bg-surface p-6 shadow-card">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h1 class="text-2xl font-bold text-fg">{{ event.name }}</h1>
                <span
                  class="rounded-md px-2 py-0.5 text-xs font-medium"
                  :class="
                    event.affects_rating ? 'bg-accent/20 text-accent' : 'bg-surface-3 text-fg-muted'
                  "
                >
                  {{ event.affects_rating ? 'Ranked' : 'Casual' }}
                </span>
              </div>
              <p class="mt-1 text-sm text-primary">
                {{ eventTypeLabels[event.event_type] || event.event_type }}
              </p>
              <p class="mt-2 text-fg-muted">
                {{ formatDateRange(event.start_date, event.end_date) }}
              </p>
              <p v-if="timeLabel" class="text-fg-muted">{{ timeLabel }}</p>
              <p v-if="event.venue || event.city" class="text-fg-muted">
                {{ [event.venue, event.city].filter(Boolean).join(', ') }}
              </p>
              <div v-if="event.fee_amount" class="mt-2 text-fg-secondary">
                Fee: {{ event.fee_currency || 'PHP' }} {{ event.fee_amount }}
              </div>
              <!-- Capacity is a CATEGORY's business in a tournament: the 3.5s
                   and the Open draw fill independently and are rarely the same
                   size, so one event-wide "2 / 16 players" was a number that
                   matched nothing anybody could enter. Open play and leagues
                   keep it, where the event really is the thing with a limit. -->
              <div v-if="!isTournament && event.max_participants" class="text-sm text-fg-muted">
                {{ registeredCount }} / {{ event.max_participants }} players
                <span v-if="placesRemaining" class="ml-1 text-warning">
                  — {{ placesRemaining }} {{ placesRemaining === 1 ? 'slot' : 'slots' }} left
                </span>
                <span v-else-if="placesRemaining === 0" class="ml-1 text-primary">— full</span>
              </div>
            </div>
            <div class="flex flex-col items-end gap-2">
              <span
                class="rounded-md px-3 py-1 text-xs font-medium capitalize"
                :class="statusConfig[event.status]?.bg + ' ' + statusConfig[event.status]?.text"
              >
                {{ event.status.replace('_', ' ') }}
              </span>

              <!-- Publish Button for Draft Events -->
              <button
                v-if="canManageEvent && event.status === 'draft'"
                :disabled="publishing"
                class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                @click="publishOpen = true"
              >
                {{ publishing ? 'Publishing...' : 'Publish Event' }}
              </button>

              <!-- Draft only. A published event is cancelled, never deleted, so
                   the record and anyone's plans around it survive. -->
              <button
                v-if="canManageEvent && event.status === 'draft'"
                :disabled="deleting"
                class="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                @click="deleteOpen = true"
              >
                {{ deleting ? 'Deleting...' : 'Delete Draft' }}
              </button>

              <!-- Registration Actions -->
              <template v-if="event.status === 'published' || event.status === 'active'">
                <button
                  v-if="!isRegistered"
                  class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  :disabled="registering"
                  @click="handleRegister"
                >
                  {{ registering ? 'Registering...' : 'Register' }}
                </button>
                <template v-else>
                  <span class="text-sm text-primary">
                    {{ myRegistration?.status === 'checked_in' ? 'Checked In' : 'Registered' }}
                  </span>
                  <button
                    v-if="myRegistration?.status === 'registered' && event.status === 'active'"
                    class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                    :disabled="checkingIn"
                    @click="handleCheckIn"
                  >
                    {{ checkingIn ? 'Checking in...' : 'Check In' }}
                  </button>
                  <!-- Not on a tournament. This withdraws an EVENT registration,
                       which is a different table from a category entry and means
                       nothing for one — a player who had entered two categories
                       pressed it and nothing they could see changed. Withdrawing
                       from a tournament is per-category, on the category card,
                       where the entry actually lives. -->
                  <button
                    v-if="!isTournament"
                    class="text-xs text-fg-muted hover:text-danger"
                    :disabled="withdrawing"
                    @click="withdrawOpen = true"
                  >
                    {{ withdrawing ? 'Withdrawing...' : 'Withdraw' }}
                  </button>
                </template>
              </template>
            </div>
          </div>
        </div>

        <!-- A tournament event has no tab bar: there is nothing page-level to
             switch between once every category owns its own players, draw,
             schedule and result. Queue is deliberately absent — it is an
             open-play feature, and the tournament "Queue" tab was never one. -->
        <template v-if="isTournament">
          <TournamentCategorySection
            v-if="primaryTournament"
            :event="event"
            :tournament="primaryTournament"
            :can-manage="canManageEvent"
            :is-organizer="isOrganizer"
            :my-player-id="myProfile?.id ?? null"
          />
          <div v-else-if="!tournamentsPending" class="rounded-xl bg-surface p-6 shadow-card">
            <p class="text-fg-muted">
              This tournament has no draw set up yet. Editing the event recreates it.
            </p>
          </div>
        </template>

        <template v-else>
          <!-- Tabs -->
          <div class="mb-4 flex gap-1 rounded-lg bg-surface p-1">
            <button
              v-for="tab in ['info', 'matches', 'players', 'rankings', 'queue'] as const"
              :key="tab"
              class="flex-1 rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors"
              :class="
                activeTab === tab
                  ? 'bg-primary text-on-primary'
                  : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
              "
              @click="activeTab = tab"
            >
              {{ tab }}
              <span
                v-if="tab === 'players' && registrationsData?.data"
                class="ml-1 text-xs opacity-75"
              >
                ({{ registrationsData.data.length }})
              </span>
              <span v-if="tab === 'matches' && matchesData?.data" class="ml-1 text-xs opacity-75">
                ({{ matchesData.data.length }})
              </span>
            </button>
          </div>

          <!-- Tab Content: Info -->
          <div v-if="activeTab === 'info'" class="space-y-4">
            <!-- About. The description was previously a paragraph in the page
               header and was never editable; it is the substance of the Info
               tab, so it lives here and organisers can change it in place. -->
            <div class="rounded-xl bg-surface p-6 shadow-card">
              <div class="mb-3 flex items-center justify-between gap-3">
                <h2 class="text-lg font-semibold text-fg">About this event</h2>
                <button
                  v-if="canManageEvent && !editingDescription"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  @click="startEditDescription"
                >
                  <UiIcon name="edit" size="h-4 w-4" />
                  Edit
                </button>
              </div>

              <div v-if="editingDescription" class="space-y-3">
                <textarea
                  v-model="descriptionDraft"
                  rows="5"
                  maxlength="2000"
                  placeholder="What should players know about this event? Format, skill level, what to bring…"
                  class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
                />
                <p v-if="descriptionError" class="text-sm text-red-400">{{ descriptionError }}</p>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    :disabled="savingDescription"
                    class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                    @click="saveDescription"
                  >
                    {{ savingDescription ? 'Saving…' : 'Save' }}
                  </button>
                  <button
                    type="button"
                    :disabled="savingDescription"
                    class="rounded-lg px-4 py-2 text-sm font-medium text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
                    @click="cancelEditDescription"
                  >
                    Cancel
                  </button>
                  <span class="ml-auto text-xs text-fg-muted">
                    {{ descriptionDraft.length }} / 2000
                  </span>
                </div>
              </div>

              <template v-else>
                <p v-if="event.description" class="whitespace-pre-line text-fg-secondary">
                  {{ event.description }}
                </p>
                <p v-else class="text-sm text-fg-muted">
                  {{
                    canManageEvent
                      ? 'No description yet. Add one so players know what to expect.'
                      : 'The organiser has not added a description for this event.'
                  }}
                </p>
              </template>

              <!-- The same facts as the header, laid out as a definition list.
                 The header is a summary strip; this is where someone deciding
                 whether to turn up actually reads them. -->
              <dl class="mt-6 grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-2">
                <div>
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">When</dt>
                  <dd class="mt-0.5 text-sm text-fg">
                    {{ formatDateRange(event.start_date, event.end_date) }}
                    <span v-if="timeLabel" class="block text-fg-secondary">{{ timeLabel }}</span>
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">Where</dt>
                  <dd class="mt-0.5 text-sm text-fg">
                    {{
                      [event.venue, event.city, event.province].filter(Boolean).join(', ') ||
                      'Venue not set'
                    }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">Format</dt>
                  <dd class="mt-0.5 text-sm text-fg">
                    {{ eventTypeLabels[event.event_type] || event.event_type }}
                    <span class="text-fg-muted">
                      · {{ event.affects_rating ? 'Ranked' : 'Casual' }}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">Entry fee</dt>
                  <dd class="mt-0.5 text-sm text-fg">
                    <template v-if="event.fee_amount">
                      {{ event.fee_currency || 'PHP' }} {{ event.fee_amount }}
                    </template>
                    <template v-else>Free</template>
                  </dd>
                </div>
                <!-- Same reasoning as the header count: a tournament's numbers
                     are per category, and the cards below carry them. -->
                <div v-if="!isTournament">
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">Players</dt>
                  <dd class="mt-0.5 text-sm text-fg">
                    {{ registeredCount }}
                    <template v-if="event.max_participants">
                      / {{ event.max_participants }} registered
                    </template>
                    <template v-else>registered</template>
                  </dd>
                </div>
                <div v-if="event.registration_closes">
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">Registration closes</dt>
                  <dd class="mt-0.5 text-sm text-fg">
                    {{ formatDateRange(event.registration_closes, event.registration_closes) }}
                  </dd>
                </div>
              </dl>
            </div>

            <!-- Submit Match Button (for non-tournament types) -->
            <div
              v-if="event.event_type !== 'tournament' && isRegistered && event.status === 'active'"
              class="rounded-xl bg-surface p-6 shadow-card"
            >
              <NuxtLink
                :to="`/matches/submit?event=${eventId}`"
                class="block w-full rounded-lg bg-primary py-3 text-center font-medium text-on-primary hover:bg-primary-hover"
              >
                Record Match
              </NuxtLink>
            </div>

            <!-- Queue Settings Info -->
            <div v-if="event.queue_enabled" class="rounded-xl bg-surface p-6 shadow-card">
              <h2 class="mb-3 text-lg font-semibold text-fg">Queue System</h2>
              <p class="text-fg-secondary">
                This event has matchmaking queue enabled with {{ event.queue_courts }} court(s).
                Mode:
                <span class="capitalize">{{ event.queue_mode.replace('_', ' ') }}</span>
              </p>
              <p class="mt-2 text-sm text-fg-muted">
                Auto-matching coming soon. Currently, the organizer assigns matches manually.
              </p>
            </div>
          </div>

          <!-- Tab Content: Matches -->
          <div v-if="activeTab === 'matches'" class="rounded-xl bg-surface p-6 shadow-card">
            <div v-if="matchesPending" class="space-y-3">
              <div v-for="i in 5" :key="i" class="h-16 animate-pulse rounded-lg bg-canvas" />
            </div>
            <div v-else-if="!matchesData?.data.length" class="text-center py-8">
              <p class="text-fg-muted">No matches recorded yet.</p>
            </div>
            <div v-else class="space-y-3">
              <NuxtLink
                v-for="match in matchesData.data"
                :key="match.id"
                :to="`/matches/${match.id}`"
                class="block rounded-lg bg-canvas p-4 transition-all hover:bg-surface-2"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-sm capitalize text-fg-muted">{{ match.match_type }}</span>
                      <span
                        class="rounded px-2 py-0.5 text-xs"
                        :class="
                          statusConfig[match.status]?.bg + ' ' + statusConfig[match.status]?.text
                        "
                      >
                        {{ match.status }}
                      </span>
                    </div>
                    <div class="mt-1 text-fg">
                      <span
                        v-for="(p, i) in match.participants.filter(
                          (pp: MatchListParticipantDto) => pp.team_number === 1
                        )"
                        :key="p.player_id"
                      >
                        {{ Number(i) > 0 ? ' & ' : '' }}{{ p.display_name }}
                      </span>
                      <span class="mx-2 text-fg-muted">vs</span>
                      <span
                        v-for="(p, i) in match.participants.filter(
                          (pp: MatchListParticipantDto) => pp.team_number === 2
                        )"
                        :key="p.player_id"
                      >
                        {{ Number(i) > 0 ? ' & ' : '' }}{{ p.display_name }}
                      </span>
                    </div>
                    <div class="mt-1 text-sm text-primary">
                      {{ formatScore(match.scores) }}
                    </div>
                  </div>
                  <div class="text-right text-sm text-fg-muted">
                    {{
                      new Date(match.played_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    }}
                  </div>
                </div>
              </NuxtLink>
            </div>
          </div>

          <!-- Tab Content: Players -->
          <div v-if="activeTab === 'players'" class="rounded-xl bg-surface p-6 shadow-card">
            <div v-if="registrationsPending" class="space-y-3">
              <div v-for="i in 5" :key="i" class="h-12 animate-pulse rounded-lg bg-canvas" />
            </div>
            <div v-else-if="!registrationsData?.data.length" class="text-center py-8">
              <p class="text-fg-muted">No players registered yet.</p>
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="reg in registrationsData.data"
                :key="reg.id"
                class="flex items-center justify-between rounded-lg bg-canvas p-3"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-sm font-medium text-fg"
                  >
                    {{ reg.player?.display_name?.charAt(0) || '?' }}
                  </div>
                  <div>
                    <NuxtLink
                      :to="`/players/${reg.player_id}`"
                      class="font-medium text-fg hover:text-primary"
                    >
                      {{ reg.player?.display_name || 'Unknown' }}
                    </NuxtLink>
                    <p v-if="reg.player?.rating" class="text-sm text-fg-muted">
                      Rating: {{ reg.player.rating.toFixed(2) }}
                    </p>
                  </div>
                </div>
                <div class="text-right">
                  <span
                    class="rounded px-2 py-0.5 text-xs"
                    :class="
                      reg.status === 'checked_in'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-surface-3 text-fg-muted'
                    "
                  >
                    {{ reg.status === 'checked_in' ? 'Checked In' : 'Registered' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab Content: Rankings -->
          <!-- Standings, on the shared RankingBoard. `record` rather than
             `rating`: this endpoint aggregates wins and losses from verified
             matches and deliberately carries no rating delta (rating_transactions
             is select-own under RLS, so a shared leaderboard cannot show another
             player's movement without a service-role bypass). -->
          <div v-if="activeTab === 'rankings'">
            <RankingBoard
              :entries="rankingsData?.data ?? []"
              variant="record"
              :loading="rankingsPending"
              :highlight-id="myProfile?.id ?? null"
              :glow="false"
              empty-title="No standings yet"
              empty-message="Standings appear once matches at this event have been verified."
              @select="navigateTo(`/players/${$event.player_id}`)"
            />
          </div>

          <!-- Tab Content: Queue -->
          <div v-if="activeTab === 'queue'" class="space-y-4">
            <template v-if="event.queue_enabled">
              <div class="rounded-xl bg-surface p-6 shadow-card">
                <p class="text-sm text-fg-muted">
                  {{ event.queue_courts }} court(s) · {{ event.queue_mode.replace('_', ' ') }} mode
                </p>

                <div
                  v-if="queueError"
                  class="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400"
                >
                  {{ queueError }}
                </div>

                <!-- Join / Leave -->
                <div v-if="isRegistered && !canManageEvent" class="mt-4">
                  <div
                    v-if="myQueueEntry"
                    class="flex items-center justify-between rounded-lg bg-canvas p-4"
                  >
                    <div>
                      <p class="font-medium text-fg">You're in the queue</p>
                      <p class="text-sm text-fg-muted">
                        Status: <span class="capitalize">{{ myQueueEntry.status }}</span>
                        <span v-if="myQueueEntry.court_number">
                          · Court {{ myQueueEntry.court_number }}</span
                        >
                      </p>
                    </div>
                    <button
                      v-if="myQueueEntry.status === 'waiting'"
                      :disabled="leavingQueue"
                      class="rounded-lg border border-red-400 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                      @click="handleLeaveQueue"
                    >
                      {{ leavingQueue ? 'Leaving...' : 'Leave Queue' }}
                    </button>
                  </div>
                  <div v-else class="flex flex-wrap items-end gap-3 rounded-lg bg-canvas p-4">
                    <div>
                      <label class="mb-1.5 block text-xs text-fg-secondary">Match Type</label>
                      <select
                        v-model="joinMatchType"
                        class="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
                      >
                        <option value="singles">Singles</option>
                        <option value="doubles">Doubles</option>
                      </select>
                    </div>
                    <div v-if="joinMatchType === 'doubles'">
                      <label class="mb-1.5 block text-xs text-fg-secondary">Partner</label>
                      <select
                        v-model="joinPartnerId"
                        class="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
                      >
                        <option value="" disabled>Select partner</option>
                        <option
                          v-for="p in availablePartners"
                          :key="p.player_id"
                          :value="p.player_id"
                        >
                          {{ p.player?.display_name || 'Unknown'
                          }}{{ p.player_id === defaultPartnerId ? ' ★ your duo' : '' }}
                        </option>
                      </select>
                    </div>
                    <button
                      :disabled="joiningQueue"
                      class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                      @click="handleJoinQueue"
                    >
                      {{ joiningQueue ? 'Joining...' : 'Join Queue' }}
                    </button>
                  </div>
                </div>
                <p v-else-if="!canManageEvent" class="mt-4 text-sm text-fg-muted">
                  Register for this event to join the queue.
                </p>

                <!-- Organizer: put the next pair on a court -->
                <div v-if="canManageEvent" class="mt-4 rounded-lg bg-canvas p-4">
                  <h3 class="mb-1 text-sm font-semibold text-fg">Next on court</h3>
                  <p class="mb-3 text-xs text-fg-muted">First come, first served.</p>

                  <div v-if="!nextPair" class="text-sm text-fg-muted">
                    Two waiting entries of the same format are needed before a match can start.
                  </div>
                  <div v-else class="flex flex-wrap items-end gap-3">
                    <p class="min-w-0 flex-1 text-sm text-fg">
                      {{ entryLabel(nextPair.first) }}
                      <span class="text-fg-muted">vs</span>
                      {{ entryLabel(nextPair.second) }}
                      <span class="text-xs capitalize text-fg-muted">
                        · {{ nextPair.first.match_type }}
                      </span>
                    </p>
                    <input
                      v-model="matchCourtNumber"
                      type="number"
                      min="1"
                      :max="event.queue_courts"
                      placeholder="Court #"
                      aria-label="Court number"
                      class="w-24 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      :disabled="matchingQueue"
                      class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                      @click="handleMatchNextPair"
                    >
                      {{ matchingQueue ? 'Matching…' : 'Match next' }}
                    </button>
                  </div>

                  <!-- Kept for injuries and no-shows, which is the only reason to
                     depart from the order people queued in. -->
                  <button
                    v-if="waitingEntries.length >= 2"
                    type="button"
                    class="mt-3 text-xs text-fg-muted transition-colors hover:text-fg"
                    :aria-expanded="showManualPick"
                    @click="showManualPick = !showManualPick"
                  >
                    {{ showManualPick ? 'Hide manual pick' : 'Pick manually' }}
                  </button>

                  <div
                    v-if="showManualPick"
                    class="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3"
                  >
                    <select
                      v-model="selectedEntry1"
                      class="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
                    >
                      <option value="" disabled>Player/Pair 1</option>
                      <option v-for="e in waitingEntries" :key="e.id" :value="e.id">
                        {{ e.player?.display_name
                        }}{{ e.partner ? ` & ${e.partner.display_name}` : '' }}
                      </option>
                    </select>
                    <select
                      v-model="selectedEntry2"
                      class="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
                    >
                      <option value="" disabled>Player/Pair 2</option>
                      <option v-for="e in waitingEntries" :key="e.id" :value="e.id">
                        {{ e.player?.display_name
                        }}{{ e.partner ? ` & ${e.partner.display_name}` : '' }}
                      </option>
                    </select>
                    <input
                      v-model="matchCourtNumber"
                      type="number"
                      min="1"
                      :max="event.queue_courts"
                      placeholder="Court #"
                      aria-label="Court number for the manual pick"
                      class="w-24 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      :disabled="matchingQueue"
                      class="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
                      @click="handleMatchEntries"
                    >
                      {{ matchingQueue ? 'Matching…' : 'Match this pair' }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Queue List -->
              <div class="rounded-xl bg-surface p-6 shadow-card">
                <h3 class="mb-1 font-semibold text-fg">Waiting ({{ waitingEntries.length }})</h3>
                <p class="mb-4 text-xs text-fg-muted">First come, first served.</p>
                <div v-if="queuePending" class="space-y-3">
                  <div v-for="i in 3" :key="i" class="h-14 animate-pulse rounded-lg bg-canvas" />
                </div>
                <div v-else-if="waitingEntries.length === 0" class="text-center py-6">
                  <p class="text-fg-muted">No one is waiting in the queue.</p>
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="(e, i) in waitingEntries"
                    :key="e.id"
                    class="flex items-center justify-between rounded-lg bg-canvas p-3"
                  >
                    <div class="flex items-center gap-3">
                      <span
                        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                        :class="
                          i === 0 ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-fg-secondary'
                        "
                        :title="`Position ${i + 1} in the queue`"
                      >
                        #{{ i + 1 }}
                      </span>
                      <span class="min-w-0">
                        <span class="block truncate text-fg">{{ entryLabel(e) }}</span>
                        <span class="block text-xs text-fg-muted">
                          <span class="capitalize">{{ e.match_type }}</span>
                          · {{ waitedFor(e.joined_at, clockNow) }}
                        </span>
                      </span>
                    </div>
                    <button
                      v-if="canManageEvent"
                      class="text-xs text-fg-muted hover:text-red-400"
                      @click="handleSkipEntry(e.id)"
                    >
                      Skip
                    </button>
                  </div>
                </div>

                <div v-if="activeEntries.length > 0" class="mt-6">
                  <h3 class="mb-3 font-semibold text-fg">On Court</h3>
                  <div class="space-y-2">
                    <div
                      v-for="e in activeEntries"
                      :key="e.id"
                      class="flex items-center justify-between rounded-lg bg-canvas p-3"
                    >
                      <span class="text-fg">
                        {{ e.player?.display_name
                        }}{{ e.partner ? ` & ${e.partner.display_name}` : '' }}
                      </span>
                      <span class="text-sm text-primary">Court {{ e.court_number }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="rounded-xl bg-surface p-6 text-center py-8 shadow-card">
                <p class="text-fg-muted">Queue system is not enabled for this event.</p>
              </div>
            </template>
          </div>
        </template>

        <!-- Back Link -->
        <div class="mt-6 text-center">
          <NuxtLink to="/events" class="text-sm text-primary hover:underline">
            Back to events
          </NuxtLink>
        </div>
      </template>
    </div>

    <!-- Confirmations. `UiModal` already carries the focus trap, focus
         restore, Escape handling and destructive styling these need. -->
    <UiModal
      v-model="withdrawOpen"
      title="Withdraw from this event?"
      description="Your place is released and someone on the waitlist can take it."
      confirm-label="Withdraw"
      destructive
      :loading="withdrawing"
      @confirm="handleWithdraw"
    />
    <UiModal
      v-model="publishOpen"
      title="Publish this event?"
      description="It becomes visible to all players and can no longer be deleted."
      confirm-label="Publish"
      :loading="publishing"
      @confirm="handlePublishEvent"
    />
    <UiModal
      v-model="deleteOpen"
      title="Delete this draft event?"
      description="Its tournaments and categories go with it. This cannot be undone."
      confirm-label="Delete"
      destructive
      :loading="deleting"
      @confirm="handleDeleteEvent"
    />
  </div>
</template>
