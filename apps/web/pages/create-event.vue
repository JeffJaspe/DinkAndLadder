<script setup lang="ts">
import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'
import type {
  EventClosePolicy,
  EventDto,
  EventFeePayer,
  EventType,
  QueueMode
} from '~/server/domains/event/dto/event.dto'
import type {
  TournamentFormat,
  TournamentMatchType
} from '~/server/domains/event/dto/tournament.dto'
import { TOURNAMENT_FORMATS } from '~/utils/tournament-formats'
import { limitUpsell, type LimitUpsell } from '~/utils/limit-upsell'

interface MineResponse {
  items: MyClubMembershipDto[]
}

const {
  provinces,
  cities,
  selectedProvince,
  selectedCity,
  provinceName,
  cityName,
  loadingProvinces,
  loadingCities,
  loadProvinces,
  selectProvince,
  selectCity
} = useLocationPicker()

onMounted(() => {
  loadProvinces()
})

const eventTypes: { value: EventType; label: string; description: string; ranked: boolean }[] = [
  {
    value: 'open_casual',
    label: 'Open Casual',
    description: 'Open to anyone, no rating impact',
    ranked: false
  },
  {
    value: 'open_ranked',
    label: 'Open Ranked',
    description: 'Open to anyone, affects ratings',
    ranked: true
  },
  {
    value: 'club_casual',
    label: 'Club Casual',
    description: 'Club members only, no rating impact',
    ranked: false
  },
  {
    value: 'club_ranked',
    label: 'Club Ranked',
    description: 'Club members only, affects ratings',
    ranked: true
  },
  {
    value: 'tournament',
    label: 'Tournament',
    description: 'Organized brackets, organizer inputs scores',
    ranked: true
  },
  {
    value: 'coaching',
    label: 'Coaching',
    description: 'A lesson or clinic. No draw, no ranking — just a fee.',
    ranked: false
  }
]

const form = reactive({
  club_id: '',
  name: '',
  description: '',
  event_type: 'open_casual' as EventType,
  venue: '',
  start_date: '',
  end_date: '',
  start_time: '',
  end_time: '',
  registration_opens: '',
  registration_closes: '',
  close_policy: 'manual' as EventClosePolicy,
  closes_at: '',
  min_players_to_start: '' as string,
  fee_payer: 'player' as EventFeePayer,
  organizer_fee_amount: '',
  fee_amount: '',
  max_participants: '',
  queue_enabled: false,
  queue_mode: 'first_come' as QueueMode,
  /**
   * How many courts the session runs on.
   *
   * Used to live inside the "Match Queue" block, so a session run without the
   * queue never answered it: `queue_courts` stayed null and
   * `event-court.service.openCourts` floored it at one, silently giving a
   * four-court evening a single court row with no way to fix it after publish.
   * It is a fact about the venue, not about the pairing mode, so it is asked
   * on every session now. Defaults to one because that is what those sessions
   * were already behaving as.
   */
  queue_courts: '1',
  /**
   * Game length. See 054.
   *
   * Open play was scored against DEFAULT_GAME_RULES — one game to 11, win by
   * two — with no way to say otherwise, so a club playing to 15 or a rally-
   * scored 21 had a legitimate 15-13 rejected by the score sheet as an
   * unfinished game.
   */
  target_points: 11,
  win_by_two: true,
  games_default: 1,
  visibility: 'public' as 'public' | 'private' | 'registered_only',
  // Only sent for a tournament event, where they configure the one tournament
  // created alongside it. There is no separate "add tournament" step any more.
  tournament_format: 'single_elimination' as TournamentFormat,
  tournament_match_type: 'doubles' as TournamentMatchType,
  /**
   * Singles or doubles for an open play session.
   *
   * A tournament answers this through tournament_match_type; open play never
   * asked at all, so the queue and the court board had to guess. Defaults to
   * doubles because club open play overwhelmingly is.
   */
  match_format: 'doubles' as 'singles' | 'doubles'
})

const isTournament = computed(() => form.event_type === 'tournament')

/**
 * The point targets clubs actually play to, plus an escape hatch.
 *
 * 11 is the pickleball standard and stays first. 15 and 21 are the common
 * rally-scored variants; 18 turns up in timed club formats. Anything else is
 * real but rare enough that a fifth chip would cost more than it earns, so it
 * goes behind Custom rather than being unreachable.
 */
const SCORING_PRESETS = [11, 15, 18, 21] as const

/**
 * Whether the custom field is open.
 *
 * A ref rather than `!PRESETS.includes(target)`, because an organiser who
 * opens Custom and clears the box would otherwise have the panel snap shut
 * underneath them on the way to typing "9".
 */
const usingCustomTarget = ref(false)

function pickTarget(points: number) {
  usingCustomTarget.value = false
  form.target_points = points
}

/**
 * Best-of. Even numbers are absent rather than disabled: best of 2 can end
 * 1-1, so it is not a format somebody could mean.
 */
const GAMES_OPTIONS = [
  { value: 1, label: 'One game', hint: 'The usual for open play' },
  { value: 3, label: 'Best of 3', hint: 'First to two games' },
  { value: 5, label: 'Best of 5', hint: 'First to three games' }
]

/**
 * Scoring is a property of a game, so it is asked wherever games are played.
 *
 * A tournament answers it per category — that is what 046's columns are for —
 * and a coaching session has no games at all.
 */
const wantsScoring = computed(() => !isTournament.value && !isCoaching.value)

/** The rule in one line, so the organiser reads back what they just set. */
const scoringSummary = computed(() => {
  const games = form.games_default === 1 ? 'One game' : `Best of ${form.games_default}`
  return `${games} to ${form.target_points}${form.win_by_two ? ', win by 2' : ' — first to the number takes it'}.`
})

/**
 * A coaching session is a plain event: a name, a time, a venue and an amount.
 *
 * No categories, no draw, no queue and no ranking — which is the whole reason
 * it needed a type of its own rather than being faked as a casual event, where
 * all of that came along uninvited.
 */
const isCoaching = computed(() => form.event_type === 'coaching')

/**
 * Who is teaching a coaching session.
 *
 * Any player can be the coach — including the organiser, which is the common
 * case, and a guest who is not running the event, which is why this is a
 * search rather than a checkbox. Left blank when nobody in particular is being
 * credited; the column is nullable for exactly that.
 */
const coachQuery = ref('')
const selectedCoach = ref<{ id: string; display_name: string } | null>(null)

const { data: coachResults } = useLazyFetch<{
  data: Array<{ id: string; display_name: string }>
}>('/api/v1/players/search', {
  query: computed(() => ({ q: coachQuery.value, limit: 8 })),
  // Two characters before searching: one letter matches most of the table and
  // the request would be thrown away by the next keystroke anyway.
  immediate: false,
  watch: [coachQuery],
  default: () => ({ data: [] })
})

const coachOptions = computed(() =>
  coachQuery.value.trim().length >= 2 ? (coachResults.value?.data ?? []) : []
)

/** Resolves a stored coach id to a name, for the edit form's chip. */
async function loadCoachName(coachId: string | null) {
  if (!coachId) {
    selectedCoach.value = null
    return
  }
  try {
    const player = await $fetch<{ id: string; display_name: string }>(`/api/v1/players/${coachId}`)
    selectedCoach.value = { id: player.id, display_name: player.display_name }
  } catch {
    // A coach whose profile has since gone private or been removed: keep the
    // id so saving does not silently drop it, and say plainly that the name
    // could not be read.
    selectedCoach.value = { id: coachId, display_name: 'Unknown player' }
  }
}

function pickCoach(player: { id: string; display_name: string }) {
  selectedCoach.value = player
  coachQuery.value = ''
}

// A coach on a non-coaching event would be a value nothing reads and nothing
// shows, so switching type away clears it rather than quietly carrying it.
watch(isCoaching, (coaching) => {
  if (!coaching) selectedCoach.value = null
})

const FEE_PAYERS: { value: EventFeePayer; label: string; hint: string }[] = [
  { value: 'player', label: 'Player pays', hint: 'Charged on registration' },
  { value: 'organizer', label: 'I cover it', hint: 'Free to the player' },
  { value: 'split', label: 'Split', hint: 'We each pay a share' }
]

// Switching to coaching turns off the surfaces that do not apply, rather than
// leaving a queue configured on an event that will never have one.
watch(isCoaching, (coaching) => {
  if (coaching) form.queue_enabled = false
})

/**
 * Hourly suggestions rather than a bare <input type="time">. Sessions here are
 * booked on the hour, and a select is far less fiddly on a phone than a time
 * spinner. 05:00 covers the earliest morning session, 22:00 the latest evening
 * one. Time is optional throughout — a multi-day tournament rarely has one
 * meaningful start time — so the empty option comes first.
 */
const TIME_OPTIONS = [
  { value: '', label: 'No time set' },
  ...Array.from({ length: 18 }, (_, index) => {
    const value = `${String(5 + index).padStart(2, '0')}:00`
    return { value, label: formatEventTime(value) }
  })
]

// Picking a start time proposes an hour-long session, which is the common case;
// it only fills a blank or plainly wrong end, never overwrites a deliberate one.
watch(
  () => form.start_time,
  (startTime) => {
    if (!startTime) return
    if (form.end_time && form.end_time > startTime) return
    const nextHour = Number(startTime.slice(0, 2)) + 1
    form.end_time = nextHour <= 23 ? `${String(nextHour).padStart(2, '0')}:00` : ''
  }
)

const submitting = ref(false)
const errorMessage = ref('')
const upsell = ref<LimitUpsell | null>(null)
const router = useRouter()
const route = useRoute()

/**
 * The same form, editing an existing draft.
 *
 * A draft was visible to its creator and offered no way to change anything, so
 * a mistyped date meant deleting it and starting again. Rather than build a
 * second form that would drift from this one field by field, `?edit=<id>`
 * prefills this one and switches the submit to PATCH.
 *
 * Only drafts: once an event is published people have registered against its
 * terms, and quietly rewriting the date or the fee underneath them is a
 * different feature with its own questions (who is told, what happens to
 * entries) that nobody has decided.
 */
const editingEventId = computed(() => (route.query.edit as string | undefined) || null)
const isEditing = computed(() => editingEventId.value !== null)

const { data: existingEvent } = await useFetch<EventDto>(
  () => `/api/v1/events/${editingEventId.value}`,
  { immediate: !!editingEventId.value }
)

watch(
  existingEvent,
  (value) => {
    if (!value) return
    form.club_id = value.club_id
    form.name = value.name
    form.description = value.description ?? ''
    form.event_type = value.event_type
    form.venue = value.venue ?? ''
    form.start_date = value.start_date
    form.end_date = value.end_date
    // The API returns `HH:MM:SS`; the time select's options are `HH:MM`, and an
    // unmatched value would silently render as "No time set".
    form.start_time = value.start_time?.slice(0, 5) ?? ''
    form.end_time = value.end_time?.slice(0, 5) ?? ''
    form.registration_opens = value.registration_opens ?? ''
    form.registration_closes = value.registration_closes ?? ''
    form.close_policy = value.close_policy
    form.closes_at = value.closes_at ? value.closes_at.slice(0, 16) : ''
    form.min_players_to_start = value.min_players_to_start?.toString() ?? ''
    form.fee_amount = value.fee_amount?.toString() ?? ''
    form.max_participants = value.max_participants?.toString() ?? ''
    form.queue_enabled = value.queue_enabled
    form.queue_mode = value.queue_mode
    form.queue_courts = value.queue_courts?.toString() ?? '1'
    form.target_points = value.target_points
    form.win_by_two = value.win_by_two
    form.games_default = value.games_default
    // A stored target that is not one of the chips has to open the custom
    // field, or editing the event would silently snap it back to 11.
    usingCustomTarget.value = !SCORING_PRESETS.includes(
      value.target_points as (typeof SCORING_PRESETS)[number]
    )
    form.visibility = value.visibility
    form.match_format = value.match_format
    form.fee_payer = value.fee_payer
    form.organizer_fee_amount = value.organizer_fee_amount?.toString() ?? ''
    // The event carries only the coach's id, so the name is looked up rather
    // than shown as a placeholder — a chip reading "Selected coach" tells an
    // organiser nothing about whether it is the right person.
    void loadCoachName(value.coach_player_id)
  },
  { immediate: true }
)

const {
  data: clubsData,
  pending: clubsPending,
  error: clubsError
} = await useFetch<MineResponse>('/api/v1/clubs/mine')

const adminClubs = computed(() => {
  if (!clubsData.value?.items) return []
  return clubsData.value.items.filter(
    (m) => m.status === 'active' && (m.role === 'OWNER' || m.role === 'ADMIN')
  )
})

// Auto-select when there's only one club to choose from — no reason to make someone
// pick from a dropdown with a single option (plan: Phase 4.3).
watch(
  adminClubs,
  (clubs) => {
    if (clubs.length === 1 && !form.club_id) {
      form.club_id = clubs[0].club.id
    }
  },
  { immediate: true }
)

const selectedEventType = computed(() => eventTypes.find((t) => t.value === form.event_type))

/**
 * The court count actually sent, as a number.
 *
 * A coaching session has no courts to run, and a tournament's courts come from
 * its draw, so both send 1 rather than whatever was left in the box — the
 * column is NOT NULL and the value would be a number nothing reads.
 */
const courtCount = computed(() => {
  if (isCoaching.value || isTournament.value) return 1
  const parsed = parseInt(form.queue_courts, 10)
  return Number.isFinite(parsed) ? parsed : 1
})

/**
 * Everything wrong with the form, in the order the fields appear.
 *
 * A list rather than the first failure: somebody who left three fields blank
 * should be told all three, not made to press Create three times. The service
 * checks the same bounds — this exists so the answer arrives before a request
 * does, not instead of the server's.
 */
const validationProblems = computed<string[]>(() => {
  const problems: string[] = []
  if (!form.club_id) problems.push('Choose the club hosting this event.')
  if (!form.name.trim()) problems.push('Give the event a name.')
  if (!form.start_date) problems.push('Set a start date.')
  if (!form.end_date) problems.push('Set an end date.')
  if (form.end_date && form.start_date && form.end_date < form.start_date) {
    problems.push('The end date cannot be before the start date.')
  }
  if (!form.registration_closes) problems.push('Set when registration closes.')
  if (form.close_policy === 'scheduled' && !form.closes_at) {
    problems.push('A scheduled session needs a closing time.')
  }

  if (!isCoaching.value && !isTournament.value) {
    const courts = parseInt(form.queue_courts, 10)
    if (!Number.isFinite(courts) || courts < 1 || courts > 24) {
      problems.push('Number of courts must be between 1 and 24.')
    }
  }

  if (wantsScoring.value) {
    const target = form.target_points
    if (!Number.isInteger(target) || target < 1 || target > 99) {
      problems.push('Points to win must be a whole number between 1 and 99.')
    }
  }

  return problems
})

async function submit() {
  if (validationProblems.value.length) {
    errorMessage.value = validationProblems.value.join(' ')
    return
  }
  errorMessage.value = ''
  submitting.value = true

  try {
    // An edit PATCHes the existing row; club_id and the tournament fields are
    // omitted below because neither can be changed after creation — moving an
    // event between clubs, and switching a draw's format once a bracket shape
    // has been chosen, are both their own decisions.
    if (isEditing.value) {
      await $fetch(`/api/v1/events/${editingEventId.value}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          description: form.description || null,
          event_type: form.event_type,
          venue: form.venue || null,
          province: provinceName.value || null,
          city: cityName.value || null,
          start_date: form.start_date,
          end_date: form.end_date,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          registration_opens: form.registration_opens || null,
          registration_closes: form.registration_closes || null,
          close_policy: form.close_policy,
          closes_at:
            form.close_policy === 'scheduled' && form.closes_at
              ? new Date(form.closes_at).toISOString()
              : null,
          min_players_to_start: form.min_players_to_start
            ? Number(form.min_players_to_start)
            : null,
          coach_player_id: isCoaching.value ? (selectedCoach.value?.id ?? null) : null,
          fee_payer: form.fee_payer,
          organizer_fee_amount:
            form.fee_payer === 'split' && form.organizer_fee_amount
              ? parseFloat(form.organizer_fee_amount)
              : null,
          fee_amount: form.fee_amount ? parseFloat(form.fee_amount) : null,
          fee_currency: form.fee_amount ? 'PHP' : null,
          max_participants: form.max_participants ? parseInt(form.max_participants) : null,
          queue_enabled: form.queue_enabled,
          queue_mode: form.queue_mode,
          queue_courts: courtCount.value,
          match_format: form.match_format,
          target_points: form.target_points,
          win_by_two: form.win_by_two,
          games_default: form.games_default,
          visibility: form.visibility
        }
      })
      router.push(`/events/${editingEventId.value}`)
      return
    }

    const created = await $fetch<{ id: string }>('/api/v1/events', {
      method: 'POST',
      body: {
        club_id: form.club_id,
        name: form.name,
        description: form.description || null,
        event_type: form.event_type,
        venue: form.venue || null,
        province: provinceName.value || null,
        city: cityName.value || null,
        start_date: form.start_date,
        end_date: form.end_date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        registration_opens: form.registration_opens || null,
        registration_closes: form.registration_closes || null,
        close_policy: form.close_policy,
        closes_at:
          form.close_policy === 'scheduled' && form.closes_at
            ? new Date(form.closes_at).toISOString()
            : null,
        min_players_to_start: form.min_players_to_start ? Number(form.min_players_to_start) : null,
        coach_player_id: isCoaching.value ? (selectedCoach.value?.id ?? null) : null,
        fee_payer: form.fee_payer,
        organizer_fee_amount:
          form.fee_payer === 'split' && form.organizer_fee_amount
            ? parseFloat(form.organizer_fee_amount)
            : null,
        fee_amount: form.fee_amount ? parseFloat(form.fee_amount) : null,
        fee_currency: form.fee_amount ? 'PHP' : null,
        max_participants: form.max_participants ? parseInt(form.max_participants) : null,
        queue_enabled: form.queue_enabled,
        queue_mode: form.queue_mode,
        queue_courts: courtCount.value,
        match_format: form.match_format,
        target_points: form.target_points,
        win_by_two: form.win_by_two,
        games_default: form.games_default,
        visibility: form.visibility,
        ...(isTournament.value
          ? {
              tournament_format: form.tournament_format,
              tournament_match_type: form.tournament_match_type
            }
          : {})
      }
    })
    router.push(`/events/${created.id}`)
  } catch (e) {
    errorMessage.value = apiErrorMessage(e, 'Something went wrong.')
    // A plan limit is the one error with a way out: the sentence plus a link,
    // never a modal. The message stays exactly what the server said.
    upsell.value = limitUpsell(e, form.club_id)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <UiPageHeader to="/events" />

      <!-- Header -->
      <div class="mb-6">
        <h1 class="font-display text-heading-1 text-fg">
          {{ isEditing ? 'Edit Event' : 'Create Event' }}
        </h1>
        <p class="mt-1 text-sm text-fg-muted">
          {{
            isEditing
              ? 'Changes apply to this draft. Publish when it is ready.'
              : 'Open play, ranked sessions, tournaments and coaching'
          }}
        </p>
      </div>

      <!-- Loading clubs -->
      <div v-if="clubsPending" class="rounded-xl bg-surface p-8 text-center shadow-card">
        <div
          class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
        />
        <p class="mt-4 text-fg-muted">Loading your clubs...</p>
      </div>

      <!-- Error loading clubs -->
      <div v-else-if="clubsError" class="rounded-xl bg-danger-soft p-6 text-center">
        <p class="text-danger">Could not load your clubs. Please try again.</p>
        <NuxtLink to="/my-clubs" class="mt-4 inline-block text-sm text-primary hover:underline">
          Go to My Clubs
        </NuxtLink>
      </div>

      <!-- No admin clubs -->
      <div v-else-if="!adminClubs.length" class="rounded-xl bg-surface p-8 text-center shadow-card">
        <div
          class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2"
        >
          <svg class="h-8 w-8 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <h2 class="font-display text-heading-3 text-fg">No Clubs to Manage</h2>
        <p class="mt-2 text-sm text-fg-muted">
          You need to be an owner or admin of a club to create events.
        </p>
        <div class="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <NuxtLink
            to="/create-club"
            class="rounded-lg bg-primary px-6 py-2.5 font-medium text-on-primary hover:bg-primary-hover"
          >
            Create a Club
          </NuxtLink>
          <NuxtLink
            to="/clubs"
            class="rounded-lg border border-border-strong px-6 py-2.5 font-medium text-fg-secondary hover:bg-surface-2"
          >
            Browse Clubs
          </NuxtLink>
        </div>
      </div>

      <!-- Form -->
      <form v-else class="space-y-6" @submit.prevent="submit">
        <!-- Basic Info -->
        <div class="rounded-xl bg-surface p-5 shadow-card">
          <h2 class="mb-4 font-display text-heading-3 text-fg">Basic Information</h2>
          <div class="space-y-4">
            <div>
              <label
                :for="adminClubs.length === 1 ? undefined : 'event-club'"
                class="mb-1.5 block text-sm text-fg-secondary"
                >Hosting Club</label
              >
              <div
                v-if="adminClubs.length === 1"
                class="w-full rounded-lg border border-border-strong bg-canvas/50 px-4 py-2.5 text-fg"
              >
                {{ adminClubs[0].club.name }}
              </div>
              <select
                v-else
                id="event-club"
                v-model="form.club_id"
                required
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="" disabled>Select a club</option>
                <option v-for="m in adminClubs" :key="m.club.id" :value="m.club.id">
                  {{ m.club.name }} ({{ m.role }})
                </option>
              </select>
              <p class="mt-1 text-xs text-fg-muted">
                Only clubs where you are an owner or admin are shown
              </p>
            </div>
            <div>
              <label for="event-name" class="mb-1.5 block text-sm text-fg-secondary"
                >Event Name</label
              >
              <input
                id="event-name"
                v-model="form.name"
                type="text"
                required
                placeholder="e.g., Friday Night Open Play"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label for="event-description" class="mb-1.5 block text-sm text-fg-secondary"
                >Description</label
              >
              <textarea
                id="event-description"
                v-model="form.description"
                rows="3"
                placeholder="Describe your event..."
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        </div>

        <!-- Event Type -->
        <fieldset class="rounded-xl bg-surface p-5 shadow-card">
          <legend class="mb-4 font-display text-heading-3 text-fg">Event Type</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <label
              v-for="t in eventTypes"
              :key="t.value"
              class="flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-all"
              :class="
                form.event_type === t.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border-strong hover:border-primary/50'
              "
            >
              <input
                v-model="form.event_type"
                type="radio"
                :value="t.value"
                class="mt-1 h-4 w-4 border-border-strong text-primary focus:ring-primary"
              />
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-fg">{{ t.label }}</span>
                  <span
                    v-if="t.ranked"
                    class="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-primary"
                  >
                    Ranked
                  </span>
                </div>
                <p class="mt-0.5 text-xs text-fg-muted">{{ t.description }}</p>
              </div>
            </label>
          </div>
          <div
            v-if="selectedEventType?.ranked"
            class="mt-3 rounded-lg bg-accent-soft p-3 text-sm text-primary"
          >
            Matches in this event will affect player ratings.
          </div>
        </fieldset>

        <!-- Schedule -->
        <div class="rounded-xl bg-surface p-5 shadow-card">
          <h2 class="mb-4 font-display text-heading-3 text-fg">Schedule</h2>
          <div class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label for="event-start-date" class="mb-1.5 block text-sm text-fg-secondary"
                  >Start Date</label
                >
                <input
                  id="event-start-date"
                  v-model="form.start_date"
                  type="date"
                  required
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label for="event-end-date" class="mb-1.5 block text-sm text-fg-secondary"
                  >End Date</label
                >
                <input
                  id="event-end-date"
                  v-model="form.end_date"
                  type="date"
                  required
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <UiSelect
                v-model="form.start_time"
                class="w-full"
                label="Start Time"
                :options="TIME_OPTIONS"
              />
              <UiSelect
                v-model="form.end_time"
                class="w-full"
                label="End Time"
                :options="TIME_OPTIONS"
              />
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label for="event-registration-opens" class="mb-1.5 block text-sm text-fg-secondary"
                  >Registration Opens</label
                >
                <input
                  id="event-registration-opens"
                  v-model="form.registration_opens"
                  type="date"
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label
                  for="event-registration-closes"
                  class="mb-1.5 block text-sm text-fg-secondary"
                >
                  Registration Closes <span class="text-danger">*</span>
                </label>
                <input
                  id="event-registration-closes"
                  v-model="form.registration_closes"
                  type="date"
                  required
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p class="mt-1 text-caption text-fg-muted">
                  When sign-ups stop. Required — a session with no closing date never stops taking
                  entries.
                </p>
              </div>
            </div>

            <!-- How the session itself ends, which is a different question from
                 when sign-ups stop: a drop-in session can keep taking players
                 right up until the organiser calls it. -->
            <fieldset class="mt-4 border-t border-border pt-4">
              <legend class="mb-1.5 block text-sm text-fg-secondary">
                How does this session end?
              </legend>
              <div class="grid gap-2 sm:grid-cols-2">
                <label
                  class="flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition-all"
                  :class="
                    form.close_policy === 'manual'
                      ? 'border-primary bg-primary/5'
                      : 'border-border-strong hover:border-primary/50'
                  "
                >
                  <input
                    v-model="form.close_policy"
                    type="radio"
                    value="manual"
                    class="mt-1 h-4 w-4 border-border-strong text-primary focus:ring-primary"
                  />
                  <span>
                    <span class="block text-sm font-medium text-fg">I'll close it</span>
                    <span class="mt-0.5 block text-caption text-fg-muted">
                      Stays open until you end it
                    </span>
                  </span>
                </label>
                <label
                  class="flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition-all"
                  :class="
                    form.close_policy === 'scheduled'
                      ? 'border-primary bg-primary/5'
                      : 'border-border-strong hover:border-primary/50'
                  "
                >
                  <input
                    v-model="form.close_policy"
                    type="radio"
                    value="scheduled"
                    class="mt-1 h-4 w-4 border-border-strong text-primary focus:ring-primary"
                  />
                  <span>
                    <span class="block text-sm font-medium text-fg">Close at a set time</span>
                    <span class="mt-0.5 block text-caption text-fg-muted">Ends on its own</span>
                  </span>
                </label>
              </div>
              <div v-if="form.close_policy === 'scheduled'" class="mt-3">
                <label for="event-closes-at" class="mb-1.5 block text-sm text-fg-secondary"
                  >Closes at</label
                >
                <input
                  id="event-closes-at"
                  v-model="form.closes_at"
                  type="datetime-local"
                  required
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </fieldset>
          </div>
        </div>

        <!-- Capacity & Fees -->
        <div class="rounded-xl bg-surface p-5 shadow-card">
          <h2 class="mb-4 font-display text-heading-3 text-fg">Capacity & Fees</h2>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label for="event-max-participants" class="mb-1.5 block text-sm text-fg-secondary"
                >Max Participants</label
              >
              <input
                id="event-max-participants"
                v-model="form.max_participants"
                type="number"
                min="2"
                placeholder="Leave empty for unlimited"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label for="event-fee-amount" class="mb-1.5 block text-sm text-fg-secondary"
                >Registration Fee (PHP)</label
              >
              <input
                id="event-fee-amount"
                v-model="form.fee_amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0 for free"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <!-- Who is teaching. Only on a coaching session — on anything else
               the field would be a value nothing reads. -->
          <div v-if="isCoaching" class="mt-4 border-t border-border pt-4">
            <label for="event-coach" class="mb-1.5 block text-sm text-fg-secondary">
              Coach <span class="text-fg-muted">(optional)</span>
            </label>

            <div
              v-if="selectedCoach"
              class="flex items-center justify-between gap-3 rounded-lg bg-canvas px-4 py-2.5"
            >
              <span class="font-medium text-fg">{{ selectedCoach.display_name }}</span>
              <button
                type="button"
                class="text-sm text-fg-muted hover:text-danger"
                @click="selectedCoach = null"
              >
                Change
              </button>
            </div>

            <div v-else class="relative">
              <input
                id="event-coach"
                v-model="coachQuery"
                type="text"
                placeholder="Search players by name"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <ul
                v-if="coachOptions.length"
                class="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-card"
              >
                <li v-for="player in coachOptions" :key="player.id">
                  <button
                    type="button"
                    class="w-full px-4 py-2 text-left text-sm text-fg hover:bg-surface-2"
                    @click="pickCoach(player)"
                  >
                    {{ player.display_name }}
                  </button>
                </li>
              </ul>
              <p class="mt-1 text-caption text-fg-muted">
                Any player can be the coach, including you. Leave blank if nobody is being credited.
              </p>
            </div>
          </div>

          <!-- Who bears the fee. The amount above has always meant "what the
               player is charged", with no way to say the organiser is covering
               it — so an organiser-funded session had to be listed as free and
               the real cost went unrecorded. -->
          <fieldset v-if="form.fee_amount" class="mt-4 border-t border-border pt-4">
            <legend class="mb-1.5 block text-sm text-fg-secondary">Who pays?</legend>
            <div class="grid gap-2 sm:grid-cols-3">
              <label
                v-for="option in FEE_PAYERS"
                :key="option.value"
                class="flex cursor-pointer items-start gap-2.5 rounded-lg border-2 p-3 transition-all"
                :class="
                  form.fee_payer === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border-strong hover:border-primary/50'
                "
              >
                <input
                  v-model="form.fee_payer"
                  type="radio"
                  :value="option.value"
                  class="mt-0.5 h-4 w-4 border-border-strong text-primary focus:ring-primary"
                />
                <span>
                  <span class="block text-sm font-medium text-fg">{{ option.label }}</span>
                  <span class="mt-0.5 block text-caption text-fg-muted">{{ option.hint }}</span>
                </span>
              </label>
            </div>

            <div v-if="form.fee_payer === 'split'" class="mt-3">
              <label for="event-organizer-share" class="mb-1.5 block text-sm text-fg-secondary">
                Organizer's share (PHP)
              </label>
              <input
                id="event-organizer-share"
                v-model="form.organizer_fee_amount"
                type="number"
                min="0"
                step="0.01"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </fieldset>
        </div>

        <!-- Tournament shape. Replaces the old create-tournament page, whose
             heading read "Create Category" while it created a tournament. -->
        <div v-if="isTournament" class="rounded-xl bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Tournament format</h2>
          <p class="mt-0.5 text-sm text-fg-muted">
            The default every category in this tournament starts from. You add the categories
            themselves on the event page, and each one can be changed to a different format there.
          </p>

          <div class="mt-4 space-y-3">
            <label
              v-for="option in TOURNAMENT_FORMATS"
              :key="option.value"
              class="flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition-all"
              :class="
                form.tournament_format === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border-strong hover:border-primary/40'
              "
            >
              <input
                v-model="form.tournament_format"
                type="radio"
                :value="option.value"
                class="mt-0.5 accent-primary"
              />
              <span class="min-w-0">
                <span class="block text-sm font-medium text-fg">{{ option.label }}</span>
                <span class="block text-xs text-fg-muted">{{ option.description }}</span>
              </span>
            </label>
          </div>

          <div class="mt-4">
            <span class="mb-1.5 block text-xs text-fg-secondary">Match type</span>
            <div class="flex gap-2">
              <label
                v-for="type in ['singles', 'doubles'] as const"
                :key="type"
                class="flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm capitalize transition-all"
                :class="
                  form.tournament_match_type === type
                    ? 'border-primary bg-primary/5 text-fg'
                    : 'border-border-strong text-fg-secondary hover:border-primary/40'
                "
              >
                <input
                  v-model="form.tournament_match_type"
                  type="radio"
                  :value="type"
                  class="accent-primary"
                />
                {{ type }}
              </label>
            </div>
            <p class="mt-1.5 text-xs text-fg-muted">
              Doubles asks each entrant for a partner when they register.
            </p>
          </div>
        </div>

        <!-- Format and courts. Open play only: a tournament answers the format
             per category, and its courts come from the draw. -->
        <div v-if="!isTournament && !isCoaching" class="rounded-xl bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Format &amp; courts</h2>
          <p class="mt-0.5 text-sm text-fg-muted">
            What people will be playing, and how much of the venue you have. This decides how the
            queue pairs players and how many go on each court.
          </p>

          <fieldset class="mt-4">
            <legend class="sr-only">Match format</legend>
            <div class="flex gap-2">
              <label
                v-for="type in ['doubles', 'singles'] as const"
                :key="type"
                class="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm capitalize transition-all"
                :class="
                  form.match_format === type
                    ? 'border-primary bg-primary/5 text-fg'
                    : 'border-border-strong text-fg-secondary hover:border-primary/40'
                "
              >
                <input
                  v-model="form.match_format"
                  type="radio"
                  :value="type"
                  class="accent-primary"
                />
                {{ type }}
              </label>
            </div>
          </fieldset>
          <p class="mt-1.5 text-xs text-fg-muted">
            Doubles is listed first because it is what most club sessions run.
          </p>

          <!-- Courts. This lived inside the Match Queue block, so a session run
               without the queue never answered it and started with exactly one
               court however many the venue has - and there was no way to
               correct it once the event was published. -->
          <div class="mt-4 border-t border-border pt-4">
            <label for="event-courts" class="mb-1.5 block text-sm text-fg-secondary">
              Number of courts
            </label>
            <input
              id="event-courts"
              v-model="form.queue_courts"
              type="number"
              inputmode="numeric"
              min="1"
              max="24"
              required
              aria-describedby="event-courts-hint"
              class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 sm:w-40"
            />
            <p id="event-courts-hint" class="mt-1 text-xs text-fg-muted">
              How many courts you have for this session. Games are recorded per court, so this has
              to match the venue whether or not you use the queue.
            </p>
          </div>
        </div>

        <!-- Scoring. The one thing open play could never say: every game was
             scored against the built-in default of one game to 11, so a club
             playing to 15 had a legitimate 15-13 rejected as unfinished. -->
        <div v-if="wantsScoring" class="rounded-xl bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Scoring</h2>
          <p class="mt-0.5 text-sm text-fg-muted">
            How a game is won. Score sheets and the live court board are validated against this, so
            it has to be the rule you are actually playing.
          </p>

          <fieldset class="mt-4">
            <legend class="mb-1.5 block text-sm text-fg-secondary">Points to win</legend>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="points in SCORING_PRESETS"
                :key="points"
                type="button"
                class="min-h-11 min-w-[3.75rem] rounded-lg border-2 px-4 text-body-1 font-semibold tabular-nums transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                :class="
                  !usingCustomTarget && form.target_points === points
                    ? 'border-primary bg-primary/5 text-fg'
                    : 'border-border-strong text-fg-secondary hover:border-primary/40'
                "
                :aria-pressed="!usingCustomTarget && form.target_points === points"
                @click="pickTarget(points)"
              >
                {{ points }}
              </button>
              <button
                type="button"
                class="min-h-11 rounded-lg border-2 px-4 text-body-2 font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                :class="
                  usingCustomTarget
                    ? 'border-primary bg-primary/5 text-fg'
                    : 'border-border-strong text-fg-secondary hover:border-primary/40'
                "
                :aria-pressed="usingCustomTarget"
                @click="usingCustomTarget = true"
              >
                Custom
              </button>
            </div>

            <div v-if="usingCustomTarget" class="mt-3">
              <label for="event-target-points" class="mb-1.5 block text-sm text-fg-secondary">
                Points to win
              </label>
              <input
                id="event-target-points"
                v-model.number="form.target_points"
                type="number"
                inputmode="numeric"
                min="1"
                max="99"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 sm:w-40"
              />
            </div>
          </fieldset>

          <!-- Win by two is what makes 12-10 and 15-13 possible at all, so it
               is stated rather than assumed: turning it off means reaching the
               number ends the game outright. -->
          <!-- The label wraps the whole row, switch and text together. With the
               text in a sibling span the only hit target was the 44x24 switch
               itself and tapping the words did nothing — which on a phone is
               most of where a thumb actually lands. -->
          <label
            class="mt-4 flex cursor-pointer items-start justify-between gap-4 border-t border-border pt-4"
          >
            <input v-model="form.win_by_two" type="checkbox" class="peer sr-only" />
            <span class="min-w-0">
              <span class="block text-sm font-medium text-fg">Win by two</span>
              <span class="mt-0.5 block text-caption text-fg-muted">
                A game runs past the target until someone leads by two. Off means first to the
                number takes it.
              </span>
            </span>
            <span
              class="relative block h-6 w-11 shrink-0 rounded-full bg-surface-3 transition-colors after:absolute after:left-0.5 after:top-1/2 after:h-5 after:w-5 after:-translate-y-1/2 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface"
            />
          </label>

          <fieldset class="mt-4 border-t border-border pt-4">
            <legend class="mb-1.5 block text-sm text-fg-secondary">Games per match</legend>
            <div class="grid gap-2 sm:grid-cols-3">
              <label
                v-for="option in GAMES_OPTIONS"
                :key="option.value"
                class="flex cursor-pointer items-start gap-2.5 rounded-lg border-2 p-3 transition-all"
                :class="
                  form.games_default === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border-strong hover:border-primary/40'
                "
              >
                <input
                  v-model.number="form.games_default"
                  type="radio"
                  :value="option.value"
                  class="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  <span class="block text-sm font-medium text-fg">{{ option.label }}</span>
                  <span class="mt-0.5 block text-caption text-fg-muted">{{ option.hint }}</span>
                </span>
              </label>
            </div>
          </fieldset>

          <!-- The rule read back in one line, because four controls above do
               not add up to a sentence anybody can check at a glance. -->
          <p class="mt-4 rounded-lg bg-primary-soft px-3 py-2 text-sm font-medium text-primary">
            {{ scoringSummary }}
          </p>
        </div>

        <!-- Queue Mode. Not offered for a tournament: a draw decides who plays
             whom, so there is nothing to queue for. -->
        <div v-if="!isTournament && !isCoaching" class="rounded-xl bg-surface p-5 shadow-card">
          <!-- Label wraps the row for the same reason the win-by-two switch
               does: with the heading outside it, the only hit target was the
               44x24 switch and tapping the words did nothing. -->
          <label class="mb-4 flex cursor-pointer items-center justify-between gap-4">
            <input v-model="form.queue_enabled" type="checkbox" class="peer sr-only" />
            <span class="min-w-0">
              <span class="block font-display text-heading-3 text-fg">Match Queue</span>
              <span class="mt-0.5 block text-sm text-fg-muted">
                Optional matchmaking system for players at the event
              </span>
            </span>
            <span
              class="relative block h-6 w-11 shrink-0 rounded-full bg-surface-3 transition-colors after:absolute after:left-0.5 after:top-1/2 after:h-5 after:w-5 after:-translate-y-1/2 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface"
            />
          </label>

          <div v-if="form.queue_enabled" class="space-y-4">
            <div class="space-y-3">
              <label
                class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
                :class="
                  form.queue_mode === 'first_come'
                    ? 'border-primary bg-primary/5'
                    : 'border-border-strong hover:border-primary/50'
                "
              >
                <input
                  v-model="form.queue_mode"
                  type="radio"
                  value="first_come"
                  class="mt-1 h-4 w-4 border-border-strong text-primary focus:ring-primary"
                />
                <div>
                  <span class="font-medium text-fg">First Come, First Served</span>
                  <p class="mt-0.5 text-sm text-fg-muted">
                    Players are matched in the order they joined the queue
                  </p>
                </div>
              </label>
              <label
                class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
                :class="
                  form.queue_mode === 'rating_based'
                    ? 'border-primary bg-primary/5'
                    : 'border-border-strong hover:border-primary/50'
                "
              >
                <input
                  v-model="form.queue_mode"
                  type="radio"
                  value="rating_based"
                  class="mt-1 h-4 w-4 border-border-strong text-primary focus:ring-primary"
                />
                <div>
                  <span class="font-medium text-fg">Rating Based</span>
                  <p class="mt-0.5 text-sm text-fg-muted">
                    Players are matched with others of similar rating
                  </p>
                </div>
              </label>
              <label
                class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
                :class="
                  form.queue_mode === 'random'
                    ? 'border-primary bg-primary/5'
                    : 'border-border-strong hover:border-primary/50'
                "
              >
                <input
                  v-model="form.queue_mode"
                  type="radio"
                  value="random"
                  class="mt-1 h-4 w-4 border-border-strong text-primary focus:ring-primary"
                />
                <div>
                  <span class="font-medium text-fg">Mix &amp; Match</span>
                  <p class="mt-0.5 text-sm text-fg-muted">
                    No repeated partners or opponents — players join on their own and the rotation
                    pairs them
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <!-- Location -->
        <div class="rounded-xl bg-surface p-5 shadow-card">
          <h2 class="mb-4 font-display text-heading-3 text-fg">Location</h2>
          <div class="space-y-4">
            <div>
              <label for="event-venue" class="mb-1.5 block text-sm text-fg-secondary">Venue</label>
              <input
                id="event-venue"
                v-model="form.venue"
                type="text"
                placeholder="e.g., Manila Sports Complex"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label for="event-province" class="mb-1.5 block text-sm text-fg-secondary"
                  >Province</label
                >
                <select
                  id="event-province"
                  :value="selectedProvince"
                  :disabled="loadingProvinces"
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                  @change="selectProvince(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">
                    {{ loadingProvinces ? 'Loading...' : 'Select province' }}
                  </option>
                  <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
                </select>
              </div>
              <div>
                <label for="event-city" class="mb-1.5 block text-sm text-fg-secondary">City</label>
                <select
                  id="event-city"
                  :value="selectedCity"
                  :disabled="!selectedProvince || loadingCities"
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                  @change="selectCity(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">
                    {{
                      loadingCities
                        ? 'Loading...'
                        : selectedProvince
                          ? 'Select city'
                          : 'Select province first'
                    }}
                  </option>
                  <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Visibility -->
        <fieldset class="rounded-xl bg-surface p-5 shadow-card">
          <legend class="mb-4 font-display text-heading-3 text-fg">Visibility</legend>
          <div class="space-y-3">
            <label
              class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
              :class="
                form.visibility === 'public'
                  ? 'border-primary bg-primary/5'
                  : 'border-border-strong hover:border-primary/50'
              "
            >
              <input
                v-model="form.visibility"
                type="radio"
                value="public"
                class="mt-1 h-4 w-4 border-border-strong text-primary focus:ring-primary"
              />
              <div>
                <span class="font-medium text-fg">Public</span>
                <p class="mt-0.5 text-sm text-fg-muted">
                  Anyone can see and register for this event
                </p>
              </div>
            </label>
            <label
              class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
              :class="
                form.visibility === 'registered_only'
                  ? 'border-primary bg-primary/5'
                  : 'border-border-strong hover:border-primary/50'
              "
            >
              <input
                v-model="form.visibility"
                type="radio"
                value="registered_only"
                class="mt-1 h-4 w-4 border-border-strong text-primary focus:ring-primary"
              />
              <div>
                <span class="font-medium text-fg">Registered Only</span>
                <p class="mt-0.5 text-sm text-fg-muted">
                  Anyone can register, but only registered players see matches
                </p>
              </div>
            </label>
            <label
              class="flex cursor-pointer items-start gap-4 rounded-lg border-2 p-4 transition-all"
              :class="
                form.visibility === 'private'
                  ? 'border-primary bg-primary/5'
                  : 'border-border-strong hover:border-primary/50'
              "
            >
              <input
                v-model="form.visibility"
                type="radio"
                value="private"
                class="mt-1 h-4 w-4 border-border-strong text-primary focus:ring-primary"
              />
              <div>
                <span class="font-medium text-fg">Private</span>
                <p class="mt-0.5 text-sm text-fg-muted">
                  Only invited participants can see and register
                </p>
              </div>
            </label>
          </div>
        </fieldset>

        <!-- Error -->
        <div v-if="errorMessage" class="rounded-xl bg-danger-soft p-4 text-danger">
          {{ errorMessage }}
          <NuxtLink
            v-if="upsell"
            :to="upsell.to"
            class="mt-2 inline-block text-sm font-medium underline underline-offset-2"
            data-testid="limit-upsell"
          >
            {{ upsell.ctaLabel }}
          </NuxtLink>
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <NuxtLink
            to="/events"
            class="flex-1 rounded-xl border border-border-strong py-3 text-center font-medium text-fg-secondary hover:bg-surface-2"
          >
            Cancel
          </NuxtLink>
          <button
            type="submit"
            :disabled="submitting"
            class="flex-1 rounded-xl bg-primary py-3 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {{
              submitting
                ? isEditing
                  ? 'Saving...'
                  : 'Creating...'
                : isEditing
                  ? 'Save changes'
                  : 'Create Event'
            }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
