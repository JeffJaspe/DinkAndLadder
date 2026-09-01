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
import type { BoxScoreMatch } from '~/components/match/BoxScore.vue'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import { apiErrorMessage } from '~/utils/api-error-message'
import type { PlatformFeeRule } from '~/utils/convenience-fee'
import type { FeeWaiver } from '~/server/domains/event/services/registration-fee'
import type { MixupSchedule } from '~/server/domains/event/services/mixup-scheduler'

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
const activeTab = ref<'info' | 'matches' | 'courts' | 'players' | 'rankings' | 'queue'>('players')

interface EventRankingEntry {
  rank: number
  player_id: string
  display_name: string
  matches_played: number
  wins: number
  losses: number
}

/** EventDto plus the per-caller fee decision this endpoint adds. */
interface EventWithFeeWaiver extends EventDto {
  fee_waiver?: FeeWaiver | null
}

const {
  data: event,
  pending: eventPending,
  error: eventError,
  refresh: refreshEvent
} = await useFetch<EventWithFeeWaiver>(`/api/v1/events/${eventId}`)

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

const {
  data: matchesData,
  pending: matchesPending,
  refresh: refreshMatches
} = await useFetch<{ data: MatchListItemDto[] }>(`/api/v1/events/${eventId}/matches`)

/**
 * The spectator boxscore, below the header and above the tabs.
 *
 * Aggregates every recorded match in the event, whatever category it came from.
 * Live scores lived only inside a category before, so somebody watching the
 * whole tournament had to open each one in turn and hold the picture in their
 * head.
 *
 * Recorded matches only: a match that has not been scored has nothing to show,
 * and the running courts are already on the Courts tab with their own controls.
 */
const boxScoreMatches = computed<BoxScoreMatch[]>(() =>
  (matchesData.value?.data ?? [])
    .filter((match) => match.scores.length > 0)
    .slice(0, 12)
    .map((match) => {
      const side = (team: 1 | 2) =>
        match.participants
          .filter((p) => p.team_number === team)
          .map((p) => p.display_name ?? 'Unknown player')

      return {
        id: match.id,
        teams: [side(1), side(2)] as [string[], string[]],
        games: match.scores.map((s) => ({
          team1_score: s.team1_score,
          team2_score: s.team2_score
        })),
        context: [match.match_type === 'singles' ? 'Singles' : 'Doubles', match.venue]
          .filter(Boolean)
          .join(' · '),
        // The event's own match list holds finished results; anything still
        // being played is on a court, which the Courts tab owns.
        liveGame: null,
        complete: match.status === 'verified'
      }
    })
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
 * Starting and ending a session.
 *
 * Neither transition existed: UpdateEventInput has no status field, so 'active'
 * was unreachable through the API - while check-in, the Record Match card and
 * the withdraw/check-in branches all gated on status === 'active'. Every one of
 * those paths was dead until now.
 */
const startingEvent = ref(false)

async function startEvent() {
  startingEvent.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/start`, { method: 'POST' })
    await refreshEvent()
    await refreshCourts()
    useToast().success('Event started. Courts are open.')
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not start the event.'))
  } finally {
    startingEvent.value = false
  }
}

const closingSession = ref(false)

/**
 * Stop taking entries without ending the event — the manual half of the close
 * policy. Play carries on; only new registrations stop.
 */
async function closeSession() {
  closingSession.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/close`, { method: 'POST' })
    await refreshEvent()
    useToast().success('Session closed. No new players can join.')
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not close the session.'))
  } finally {
    closingSession.value = false
  }
}

async function completeEvent() {
  startingEvent.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/complete`, { method: 'POST' })
    await refreshEvent()
    useToast().success('Event completed.')
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not complete the event.'))
  } finally {
    startingEvent.value = false
  }
}

/**
 * The live court board. 30-second polling plus a manual refresh, and only while
 * a court is actually playing and the tab is visible - see useLiveScores.
 */
const {
  courts,
  hasLiveCourt,
  refresh: refreshCourts,
  lastUpdated: courtsUpdatedAt
} = useLiveScores(eventId)

/**
 * Courts only appear once the session is running.
 *
 * Before that the tab would be an empty board — courts are materialised when
 * the event starts (see /events/:id/start), because queue_courts is editable
 * while the event is a draft and creating rows earlier would mean reconciling
 * them every time the organiser changed their mind.
 *
 * Declared here, below `courts` and `event`, and not up beside `activeTab`
 * where it reads more naturally. A computed body is lazy, so referencing a
 * `const` declared further down is normally harmless — but the `watch` below
 * evaluates this getter once during setup to seed its old value, which hit the
 * temporal dead zone and threw `Cannot access 'courts' before initialization`,
 * taking the whole event page down on open.
 */
const visibleTabs = computed(() => {
  const tabs: Array<'info' | 'matches' | 'courts' | 'players' | 'rankings' | 'queue'> = [
    'info',
    'matches'
  ]
  if (courts.value.length > 0) tabs.push('courts')
  tabs.push('players', 'rankings')

  // The queue is a live control surface. On a finished or cancelled event it
  // can only offer actions that cannot do anything, so it is withheld rather
  // than shown empty — the roster stays reachable under Players.
  const over = event.value?.status === 'completed' || event.value?.status === 'cancelled'
  if (!over) tabs.push('queue')

  return tabs
})

// A tab can disappear underneath the reader — finishing an event while sitting
// on Queue, for instance — so fall back rather than render nothing.
watch(visibleTabs, (tabs) => {
  if (!tabs.includes(activeTab.value)) activeTab.value = 'info'
})

const courtBusyId = ref('')

/**
 * Starting a game on a specific court.
 *
 * The two sides are picked from the waiting queue rather than typed, because a
 * court can only ever be started with entries that are actually in this event's
 * queue — the server enforces exactly that, and offering a free-text field
 * would just be a way to discover the error message.
 */
/**
 * Queue vs Mixup.
 *
 * Queue is first-come: whoever has waited longest goes on next, with whoever
 * they arrived with. Mixup rotates partners AND opponents across the session so
 * that, as far as possible, nobody partners the same person twice — the
 * "everyone plays with everyone" format a club night actually runs.
 *
 * The generated schedule is a PREVIEW and nothing is written. People arrive
 * late, leave early and pull out with a bad ankle, so a whole evening's
 * pairings committed at 7pm is a liability by 8. Courts are still started one
 * at a time; the schedule tells the desk who to put on.
 */
const pairingMode = ref<'queue' | 'mixup'>('queue')
const mixupRounds = ref(6)
const mixupSchedule = ref<MixupSchedule | null>(null)
const generatingMixup = ref(false)

async function generateMixup() {
  generatingMixup.value = true
  try {
    const result = await $fetch<{ data: MixupSchedule; player_count: number }>(
      `/api/v1/events/${eventId}/queue/mixup`,
      { method: 'POST', body: { rounds: mixupRounds.value } }
    )
    mixupSchedule.value = result.data
    if (!result.data.rounds.length) {
      useToast().info('Not enough players in the queue yet to build a rotation.')
    }
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not generate a rotation.'))
  } finally {
    generatingMixup.value = false
  }
}

function sideNames(side: { players: { player_id: string }[] }): string {
  return side.players
    .map((p) => {
      const entry = queueData?.value?.data.find(
        (q) => q.player_id === p.player_id || q.partner_id === p.player_id
      )
      if (entry?.player?.id === p.player_id) return entry.player.display_name
      if (entry?.partner?.id === p.player_id) return entry.partner.display_name
      return 'Player'
    })
    .join(' & ')
}

const startCourtId = ref('')
const startTeam1 = ref('')
const startTeam2 = ref('')
const startingCourt = ref(false)

const startCourtOpen = computed({
  get: () => startCourtId.value !== '',
  set: (open: boolean) => {
    if (!open) startCourtId.value = ''
  }
})

function openStartCourt(courtId: string) {
  startTeam1.value = waitingEntries.value[0]?.id ?? ''
  startTeam2.value = waitingEntries.value[1]?.id ?? ''
  startCourtId.value = courtId
}

/** A queue entry as one line: the player, plus their partner for doubles. */
function queueEntryLabel(entry: EventQueueDto): string {
  const names = [entry.player?.display_name, entry.partner?.display_name].filter(Boolean)
  return names.length ? names.join(' & ') : 'Unknown player'
}

async function confirmStartCourt() {
  if (!startTeam1.value || !startTeam2.value || startTeam1.value === startTeam2.value) return
  startingCourt.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/courts/${startCourtId.value}/start`, {
      method: 'POST',
      body: { team1_queue_id: startTeam1.value, team2_queue_id: startTeam2.value }
    })
    await Promise.all([refreshCourts(), refreshQueue()])
    startCourtId.value = ''
    useToast().success('Court started.')
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not start the court.'))
  } finally {
    startingCourt.value = false
  }
}

async function updateCourtScore(courtId: string, scores: unknown) {
  try {
    await $fetch(`/api/v1/events/${eventId}/courts/${courtId}/score`, {
      method: 'PATCH',
      body: { scores }
    })
    await refreshCourts()
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not update the score.'))
  }
}

async function submitCourtScore(courtId: string) {
  if (courtBusyId.value) return
  courtBusyId.value = courtId
  try {
    const result = await $fetch<{ warnings?: string[] }>(
      `/api/v1/events/${eventId}/courts/${courtId}/submit`,
      { method: 'POST' }
    )
    await Promise.all([refreshCourts(), refreshMatches()])
    // The court is freed even when the match or the auto-advance failed, so a
    // warning has to be shown rather than a blanket success.
    if (result.warnings?.length) {
      useToast().info(result.warnings.join(' '))
    } else {
      useToast().success('Score submitted. Next pair is on.')
    }
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not submit the score.'))
  } finally {
    courtBusyId.value = ''
  }
}

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
const { data: myPartnersData } = useFetch<{ data: PartnerDto[] }>('/api/v1/players/me/partners', {
  server: false,
  default: () => ({ data: [] })
})

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

/**
 * Mix & Match forms the pairs itself, so a partner is neither asked for nor
 * sent. Requiring one made a solo drop-in impossible to enter, which is the
 * normal way somebody joins an open play session.
 */
const queuePairsForYou = computed(() => queuePairsAutomatically(event.value?.queue_mode))

async function handleJoinQueue() {
  queueError.value = ''
  if (joinMatchType.value === 'doubles' && !queuePairsForYou.value && !joinPartnerId.value) {
    queueError.value = 'Select a partner to join as a doubles pair.'
    return
  }
  joiningQueue.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/queue/join`, {
      method: 'POST',
      body: {
        match_type: joinMatchType.value,
        partner_id:
          joinMatchType.value === 'doubles' && !queuePairsForYou.value ? joinPartnerId.value : null
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

/**
 * Registering for open play now goes through the same confirmation a
 * tournament category uses. Pressing Register used to post straight away, so
 * the first anyone heard of an entry fee was on the day — and when the roster
 * refresh failed the screen did not visibly change at all, which read as the
 * button doing nothing.
 *
 * The quote is read from the shared ladder in utils/convenience-fee.ts, so the
 * number shown here and the number eventually charged cannot disagree.
 */
const registerOpen = ref(false)
const registerError = ref('')

/**
 * The convenience-fee ladder, so the dialog can quote a real total rather than
 * only the entry fee. Public and cached for the page.
 */
const { data: feeRulesData } = await useFetch<{ data: PlatformFeeRule[] }>(
  '/api/v1/platform/fee-rules',
  { default: () => ({ data: [] }) }
)
const feeRules = computed(() => feeRulesData.value?.data ?? [])

async function openRegister() {
  if (!user.value) {
    await navigateTo('/login')
    return
  }
  registerError.value = ''
  registerOpen.value = true
}

async function handleRegister() {
  registering.value = true
  registerError.value = ''
  try {
    await $fetch(`/api/v1/events/${eventId}/register`, { method: 'POST' })
    await refreshRegistrations()
    registerOpen.value = false
    toast.success('You are registered for this event.')
  } catch (err) {
    // Shown inside the dialog rather than as a toast: the dialog is still up,
    // and a message behind it is a message nobody reads.
    registerError.value = apiErrorMessage(err, 'Could not register for the event.')
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
  tournament: 'Tournament',
  coaching: 'Coaching'
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

/**
 * Registered and checked-in are different things and only one of them plays.
 *
 * Registered is a claimed slot. Checked in is a player who has arrived and is
 * eligible for the rotation — which is why the queue draws on the second and
 * not the first. Both numbers were on screen with nothing saying so.
 */
const checkedInCount = computed(
  () => registrationsData.value?.data.filter((r) => r.status === 'checked_in').length ?? 0
)
const registeredOnlyCount = computed(
  () => registrationsData.value?.data.filter((r) => r.status === 'registered').length ?? 0
)
const placesRemaining = computed(() => {
  const capacity = event.value?.max_participants
  if (!capacity) return null
  return Math.max(0, capacity - registeredCount.value)
})

/**
 * Why the session cannot start yet, or null when it can.
 *
 * Capacity and readiness are different numbers and were being conflated: a
 * session at 3 of 14 was treated as not startable because it was not FULL,
 * when what actually matters is whether enough people are there to fill a
 * court. `effective_min_players_to_start` is the server's answer to that (the
 * organiser's override, or 4 for doubles / 2 for singles), so the button and
 * the API cannot disagree about it.
 */
const startBlockedReason = computed(() => {
  const needed = event.value?.effective_min_players_to_start ?? 0
  const short = needed - registeredCount.value
  if (short <= 0) return null
  return `${short} more ${short === 1 ? 'player' : 'players'} to start`
})

/**
 * What the session is doing right now, in words.
 *
 * The panel previously showed a bare count and left the reader to work out what
 * it meant. Full and playing are not mutually exclusive, so this reports the
 * play state and the capacity state separately rather than collapsing them.
 */
/**
 * The coach's name, for a coaching session.
 *
 * A separate lookup because the event carries only the id — and it is a player
 * like any other, so the name links to their profile the way every other player
 * reference on this page does.
 */
const { data: coachProfile } = await useFetch<{ id: string; display_name: string }>(
  () => `/api/v1/players/${event.value?.coach_player_id}`,
  { immediate: false, watch: [() => event.value?.coach_player_id] }
)

const sessionState = computed(() => {
  const e = event.value
  if (!e || isTournament.value) return null
  if (e.closed_at || e.status === 'completed') return { label: 'Session closed', tone: 'muted' }
  if (e.status === 'active') return { label: 'Currently playing', tone: 'live' }
  if (placesRemaining.value === 0) return { label: 'Full — no slots', tone: 'full' }
  if (placesRemaining.value !== null) {
    return {
      label: `${placesRemaining.value} ${placesRemaining.value === 1 ? 'slot' : 'slots'} left`,
      tone: 'open'
    }
  }
  return null
})
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <UiPageHeader to="/events" back-label="Events" />

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
              <!-- What kind of event this is, before its name. Nothing on the
                   page said so at a glance, so a tournament and an open play
                   session were indistinguishable until you read the body. -->
              <p
                class="mb-1 text-xs font-bold tracking-[0.14em]"
                :class="isTournament ? 'text-accent' : 'text-primary'"
              >
                {{ eventKindLabel(event.event_type) }}
              </p>
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

              <!-- Who is teaching. Any player can be the coach, so it links to
                   their profile like every other player reference here. -->
              <p v-if="event.coach_player_id" class="mt-1 text-sm text-fg-secondary">
                Coach:
                <NuxtLink
                  :to="`/players/${event.coach_player_id}`"
                  class="font-medium text-primary hover:underline"
                >
                  {{ coachProfile?.display_name ?? 'View profile' }}
                </NuxtLink>
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
              <div v-if="!isTournament" class="flex flex-wrap items-center gap-2 text-sm">
                <span v-if="event.max_participants" class="text-fg-muted">
                  {{ registeredCount }} / {{ event.max_participants }} players
                </span>

                <!-- Singles or doubles, which the record has carried since 041
                     but nothing ever showed — an all-singles session looked
                     identical to an all-doubles one. -->
                <span class="rounded-md bg-surface-3 px-2 py-0.5 text-caption font-medium capitalize text-fg-secondary">
                  {{ event.match_format }}
                </span>

                <!-- What the session is doing, said plainly. -->
                <span
                  v-if="sessionState"
                  class="rounded-md px-2 py-0.5 text-caption font-medium"
                  :class="{
                    'bg-warning-soft text-warning': sessionState.tone === 'live',
                    'bg-primary-soft text-primary': sessionState.tone === 'full',
                    'bg-surface-3 text-fg-secondary': sessionState.tone === 'open',
                    'bg-surface-2 text-fg-muted': sessionState.tone === 'muted'
                  }"
                >
                  {{ sessionState.label }}
                </span>
              </div>
            </div>
            <div class="flex flex-col items-end gap-2">
              <span
                class="rounded-md px-3 py-1 text-xs font-medium capitalize"
                :class="statusConfig[event.status]?.bg + ' ' + statusConfig[event.status]?.text"
              >
                {{ event.status.replace('_', ' ') }}
              </span>

              <!-- Start the session. Per event; courts are started individually
                   from the Courts tab once this is running. -->
              <!-- Disabled with its reason, never absent. An organiser who
                   cannot start needs to know what is missing; a button that
                   simply is not there reads as a broken page. -->
              <div v-if="canManageEvent && event.status === 'published'" class="text-right">
                <button
                  :disabled="startingEvent || startBlockedReason !== null"
                  :title="startBlockedReason ?? undefined"
                  class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  @click="startEvent"
                >
                  {{ startingEvent ? 'Starting…' : 'Start Event' }}
                </button>
                <p v-if="startBlockedReason" class="mt-1 text-caption text-fg-muted">
                  {{ startBlockedReason }}
                </p>
              </div>

              <!-- Stop taking entries while play continues. Only offered on a
                   manual-close session that is still open — a scheduled one
                   closes by its own clock, and closing twice does nothing. -->
              <button
                v-if="
                  canManageEvent &&
                  !isTournament &&
                  !event.closed_at &&
                  (event.status === 'published' || event.status === 'active')
                "
                :disabled="closingSession"
                class="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
                @click="closeSession"
              >
                {{ closingSession ? 'Closing…' : 'Close to new players' }}
              </button>

              <button
                v-if="canManageEvent && event.status === 'active'"
                :disabled="startingEvent"
                class="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
                @click="completeEvent"
              >
                {{ startingEvent ? 'Ending…' : 'End Event' }}
              </button>

              <!-- Drafts are editable. Published events are not: people have
                   registered against their terms, and rewriting the date or
                   the fee underneath them is a different feature. -->
              <NuxtLink
                v-if="canManageEvent && event.status === 'draft'"
                :to="`/create-event?edit=${event.id}`"
                class="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-secondary hover:bg-surface-2"
              >
                Edit event
              </NuxtLink>

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

              <!-- Registration Actions.
                   Not for tournaments: entering a tournament means entering a
                   CATEGORY (a rating band, singles or doubles), and this button
                   posted to the event-level /register regardless of type — so a
                   player could be "registered" for the weekend without being in
                   any draw. The real button lives on each category card. -->
              <template
                v-if="!isTournament && (event.status === 'published' || event.status === 'active')"
              >
                <button
                  v-if="!isRegistered"
                  class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  :disabled="registering"
                  @click="openRegister"
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
        <!--
          Live scores, for anyone watching rather than organising.

          Sits above the tabs on purpose: a spectator's question is "what is
          happening", and answering it should not require choosing a tab first.
          The same grid as the score sheet and the match view, so a result reads
          identically wherever it is seen.
        -->
        <section v-if="boxScoreMatches.length" class="mb-6">
          <h2 class="mb-2 font-display text-heading-3 text-fg">Scores</h2>
          <MatchBoxScore :matches="boxScoreMatches" />
        </section>

        <template v-if="isTournament">
          <!-- The board on its own page, for the screen at the desk. Running a
               draw from inside an expanded card works on a laptop and is
               hopeless on a TV nobody can scroll. target=_blank because the
               point is to leave it open on a second screen. -->
          <div class="mb-4 flex justify-end">
            <a
              :href="`/events/${eventId}/matches`"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1.5 rounded-button border border-border-strong px-3 py-1.5 text-caption text-fg-secondary transition-colors hover:border-primary hover:text-fg"
            >
              <UiIcon name="share" size="h-4 w-4" />
              Open matches in a new tab
            </a>
          </div>
          <TournamentCategorySection
            v-if="primaryTournament"
            :event="event"
            :tournament="primaryTournament"
            :fee-waiver="event.fee_waiver ?? null"
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
              v-for="tab in visibleTabs"
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
              <!-- The red LIVE dot: a player scanning the tab bar should be
                   able to tell a game is on without opening anything. -->
              <span
                v-if="(tab === 'matches' || tab === 'courts') && hasLiveCourt"
                class="ml-1.5 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-danger align-middle"
                aria-label="A game is live"
              />
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
              <h2 class="mb-3 text-lg font-semibold text-fg">
                {{ queueModeLabel(event.queue_mode) }}
              </h2>
              <p class="text-fg-secondary">
                {{ queueModeDescription(event.queue_mode) }}
              </p>
              <p class="mt-1 text-sm text-fg-muted">
                {{ event.queue_courts }} court(s) in rotation.
              </p>

              <!-- How the next match gets picked. -->
              <div v-if="canManageEvent" class="mt-4 border-t border-border pt-4">
                <p class="mb-2 text-sm font-medium text-fg-secondary">How to pair players</p>
                <div class="flex gap-2">
                  <label
                    v-for="mode in ['queue', 'mixup'] as const"
                    :key="mode"
                    class="flex flex-1 cursor-pointer items-start gap-2 rounded-lg border-2 p-3 text-sm transition-all"
                    :class="
                      pairingMode === mode
                        ? 'border-primary bg-primary/5'
                        : 'border-border-strong hover:border-primary/40'
                    "
                  >
                    <input
                      v-model="pairingMode"
                      type="radio"
                      :value="mode"
                      class="mt-1 accent-primary"
                    />
                    <span>
                      <span class="block font-medium capitalize text-fg">{{ mode }}</span>
                      <span class="block text-xs text-fg-muted">
                        {{
                          mode === 'queue'
                            ? 'First come, first served. Longest wait plays next.'
                            : 'Rotate partners and opponents so everyone plays with everyone.'
                        }}
                      </span>
                    </span>
                  </label>
                </div>

                <div v-if="pairingMode === 'mixup'" class="mt-4">
                  <div class="flex flex-wrap items-end gap-3">
                    <div>
                      <label for="mixup-rounds" class="mb-1 block text-xs text-fg-secondary">
                        Rounds
                      </label>
                      <input
                        id="mixup-rounds"
                        v-model.number="mixupRounds"
                        type="number"
                        min="1"
                        max="20"
                        class="w-24 rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
                      />
                    </div>
                    <UiButton :disabled="generatingMixup" @click="generateMixup">
                      {{ generatingMixup ? 'Generating…' : 'Generate rotation' }}
                    </UiButton>
                  </div>

                  <p class="mt-2 text-xs text-fg-muted">
                    A preview — nothing is saved. Courts are still started one at a time, so
                    latecomers and early leavers do not break the evening.
                  </p>

                  <!-- The generated rounds -->
                  <div v-if="mixupSchedule?.rounds.length" class="mt-4 space-y-3">
                    <div
                      v-for="round in mixupSchedule.rounds"
                      :key="round.round_number"
                      class="rounded-lg bg-canvas p-3"
                    >
                      <p class="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                        Round {{ round.round_number }}
                      </p>
                      <ul class="mt-2 space-y-1">
                        <li
                          v-for="match in round.matches"
                          :key="match.court_number"
                          class="flex flex-wrap items-baseline gap-2 text-sm text-fg-secondary"
                        >
                          <span class="text-xs text-fg-muted">Court {{ match.court_number }}</span>
                          <span class="text-fg">{{ sideNames(match.team1) }}</span>
                          <span class="text-fg-muted">vs</span>
                          <span class="text-fg">{{ sideNames(match.team2) }}</span>
                        </li>
                      </ul>
                      <p v-if="round.sitting_out.length" class="mt-1.5 text-xs text-fg-muted">
                        Sitting out:
                        {{ round.sitting_out.map((p) => sideNames({ players: [p] })).join(', ') }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
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
            <!--
              EV-8. Both counts appeared with no stated difference, so nobody
              could tell what either meant or why the queue drew on one and not
              the other. Said once, here, rather than left to be inferred.
            -->
            <div class="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-caption">
              <span class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-pill bg-primary" />
                <span class="font-medium text-fg">{{ checkedInCount }} checked in</span>
                <span class="text-fg-muted">— here and in the rotation</span>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-pill bg-border-strong" />
                <span class="font-medium text-fg-secondary">{{ registeredOnlyCount }} registered</span>
                <span class="text-fg-muted">— holding a slot, not arrived</span>
              </span>
            </div>

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
          <!-- Tab Content: Courts -->
          <div v-if="activeTab === 'courts'" class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="font-semibold text-fg">Courts</h2>
                <p class="text-caption text-fg-muted">
                  <span v-if="courtsUpdatedAt">
                    Updated {{ courtsUpdatedAt.toLocaleTimeString() }} · refreshes every 30 seconds
                  </span>
                  <span v-else>Live scores refresh every 30 seconds.</span>
                </p>
              </div>
              <UiButton variant="ghost" size="sm" @click="refreshCourts">Refresh</UiButton>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <EventCourtCard
                v-for="court in courts"
                :key="court.id"
                :court="court"
                :can-manage="canManageEvent"
                :busy="courtBusyId === court.id"
                @score="updateCourtScore(court.id, $event)"
                @submit="submitCourtScore(court.id)"
                @start="openStartCourt(court.id)"
              />
            </div>
          </div>

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
                  {{ event.queue_courts }} court(s) · {{ queueModeLabel(event.queue_mode) }}
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
                    <!-- Hidden in Mix & Match: the rotation pairs you, so
                         there is nothing to choose. -->
                    <div v-if="joinMatchType === 'doubles' && !queuePairsForYou">
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

    <!-- What entering this session costs, before committing to it. Same
         component the tournament categories use, so the two paths quote money
         the same way. -->
    <TournamentRegisterSummaryModal
      v-if="event"
      v-model="registerOpen"
      :category-name="event.name"
      :is-doubles="false"
      :partner-name="null"
      :subtitle="eventTypeLabels[event.event_type] ?? 'Event'"
      :fee-amount="event.fee_amount"
      :fee-currency="event.fee_currency ?? 'PHP'"
      :rules="feeRules"
      :fee-waiver="event.fee_waiver ?? null"
      payment-note="Online payment is not switched on yet — your place is held and you pay the organiser at the venue."
      :submitting="registering"
      :error="registerError"
      @confirm="handleRegister"
    />

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

    <!-- Start a court. hide-actions because Confirm has to be disabled until
         two different sides are chosen, which the built-in row cannot express. -->
    <UiModal
      v-model="startCourtOpen"
      title="Start a game"
      description="Pick the two sides from the players waiting."
      hide-actions
    >
      <div class="space-y-4">
        <div v-if="waitingEntries.length < 2" class="rounded-button bg-canvas p-4 text-center">
          <p class="text-body-2 text-fg-muted">
            At least two entries need to be waiting in the queue before a court can start.
          </p>
        </div>

        <template v-else>
          <div>
            <label for="court-team1" class="mb-1.5 block text-body-2 font-medium text-fg-secondary">
              Side 1
            </label>
            <select
              id="court-team1"
              v-model="startTeam1"
              class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none"
            >
              <option v-for="entry in waitingEntries" :key="entry.id" :value="entry.id">
                {{ queueEntryLabel(entry) }}
              </option>
            </select>
          </div>

          <div>
            <label for="court-team2" class="mb-1.5 block text-body-2 font-medium text-fg-secondary">
              Side 2
            </label>
            <select
              id="court-team2"
              v-model="startTeam2"
              class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none"
            >
              <option v-for="entry in waitingEntries" :key="entry.id" :value="entry.id">
                {{ queueEntryLabel(entry) }}
              </option>
            </select>
          </div>

          <p v-if="startTeam1 && startTeam1 === startTeam2" class="text-caption text-danger">
            Pick two different sides.
          </p>
        </template>

        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" :disabled="startingCourt" @click="startCourtOpen = false">
            Cancel
          </UiButton>
          <UiButton
            :disabled="startingCourt || !startTeam1 || !startTeam2 || startTeam1 === startTeam2"
            @click="confirmStartCourt"
          >
            {{ startingCourt ? 'Starting…' : 'Start game' }}
          </UiButton>
        </div>
      </div>
    </UiModal>
  </div>
</template>
