<script setup lang="ts">
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { MatchDto } from '~/server/domains/match/dto/match.dto'
import type { EventDto, EventRegistrationDto } from '~/server/domains/event/dto/event.dto'
import type { PartnerDto } from '~/server/domains/partnership/dto/partnership.dto'
import {
  DEFAULT_GAME_RULES,
  resolveResult,
  validateGames,
  type GameRules,
  type GameScore,
  type MatchResultType
} from '~/utils/game-rules'

useHead({ title: 'Submit a match' })

interface RegisteredPlayer {
  id: string
  display_name: string
  rating?: number | null
}

const route = useRoute()
const eventId = computed(() => route.query.event as string | undefined)

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')

/**
 * The events this player may submit from, for the picker shown when the page is
 * opened without an `?event=` id. Only fetched in that case — arriving from an
 * event already knows the answer.
 */
interface SubmittableEvent {
  id: string
  name: string
  start_date: string
  status: string
  venue: string | null
}

const { data: myEventsData, pending: myEventsPending } = await useFetch<{
  data: SubmittableEvent[]
}>('/api/v1/players/me/submittable-events', { immediate: !eventId.value })

const myEvents = computed(() => myEventsData.value?.data ?? [])

const formatEventDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })

const { data: eventData, error: eventError } = await useFetch<EventDto>(
  () => `/api/v1/events/${eventId.value}`,
  { watch: [eventId], immediate: !!eventId.value }
)

const { data: registrationsData } = await useFetch<{ data: EventRegistrationDto[] }>(
  () => `/api/v1/events/${eventId.value}/registrations`,
  { watch: [eventId], immediate: !!eventId.value }
)

const registeredPlayers = computed<RegisteredPlayer[]>(() => {
  if (!registrationsData.value?.data) return []
  return registrationsData.value.data
    .filter((r) => r.status !== 'withdrawn' && r.player)
    .map((r) => ({
      id: r.player_id,
      display_name: r.player!.display_name,
      rating: r.player!.rating
    }))
})

const matchType = ref<'singles' | 'doubles'>('singles')
const playedAt = ref('')
const venue = ref('')

const team1Player1 = ref<RegisteredPlayer | null>(null)
const team1Player2 = ref<RegisteredPlayer | null>(null)
const team2Player1 = ref<RegisteredPlayer | null>(null)
const team2Player2 = ref<RegisteredPlayer | null>(null)

/**
 * Games in the shared shape from utils/game-rules.ts, not a local one.
 *
 * These used to be { team1Score, team2Score } with 0 defaults, which made an
 * untouched game indistinguishable from a genuine 0-0 and let an all-zeros
 * match through whenever the tie check was satisfied some other way. Null means
 * "nobody has typed here".
 */
const games = ref<GameScore[]>([{ team1_score: null, team2_score: null }])

/**
 * Open play is one game. A category can say otherwise once the event carries
 * game rules; until then the defaults are the rules every existing match was
 * played to anyway (to 11, win by 2).
 */
const rules = computed<GameRules>(() => ({
  ...DEFAULT_GAME_RULES,
  bestOf: games.value.length
}))

const resultType = ref<MatchResultType>('normal')

/** Only asked for when the score cannot name a winner — a walkover. */
const explicitWinner = ref<1 | 2 | null>(null)

const result = computed(() =>
  resolveResult(games.value, rules.value, resultType.value, explicitWinner.value)
)

const scoreProblems = computed(() => validateGames(games.value, rules.value, resultType.value))

/**
 * Names for the sheet, one player per line. Placeholders until a slot is
 * filled — the grid should show its shape before the players are chosen, not
 * appear once they are.
 */
const scoreSheetTeams = computed<[string[], string[]]>(() => {
  const side = (a: RegisteredPlayer | null, b: RegisteredPlayer | null, fallback: string) => {
    const names = [a?.display_name, matchType.value === 'doubles' ? b?.display_name : null].filter(
      (n): n is string => !!n
    )
    return names.length ? names : [fallback]
  }
  return [
    side(team1Player1.value, team1Player2.value, 'Team 1'),
    side(team2Player1.value, team2Player2.value, 'Team 2')
  ]
})

const winnerLabel = computed(() =>
  result.value.winner ? scoreSheetTeams.value[result.value.winner - 1].join(' / ') : ''
)

const searchQuery = ref('')
const activeSearchField = ref<
  'team1Player1' | 'team1Player2' | 'team2Player1' | 'team2Player2' | null
>(null)

/**
 * The reader's default duo, used to pre-fill the doubles partner slot and to
 * float that player to the top of the typeahead.
 *
 * server: false — it is a signed-in-only preference and has no bearing on the
 * initial render.
 */
const { data: myPartnersData } = useFetch<{ data: PartnerDto[] }>('/api/v1/players/me/partners', {
  server: false,
  default: () => ({ data: [] })
})
const defaultPartnerId = computed(
  () => myPartnersData.value?.data.find((partner) => partner.is_default)?.player_id ?? null
)

const filteredPlayers = computed(() => {
  const selectedIds = new Set(
    [
      team1Player1.value?.id,
      team1Player2.value?.id,
      team2Player1.value?.id,
      team2Player2.value?.id
    ].filter(Boolean)
  )

  let players = registeredPlayers.value.filter((p) => !selectedIds.has(p.id))

  if (searchQuery.value.length >= 2) {
    const q = searchQuery.value.toLowerCase()
    players = players.filter((p) => p.display_name.toLowerCase().includes(q))
  }

  // The duo first — it is the player this list is most often opened to find.
  const duo = defaultPartnerId.value
  if (duo) {
    players = [...players].sort((a, b) => Number(b.id === duo) - Number(a.id === duo))
  }

  return players.slice(0, 10)
})

/**
 * Pre-fill the partner slot when doubles is chosen.
 *
 * Only when the duo is actually registered for this event — an unregistered
 * player cannot be a participant, and pre-filling a name the server will
 * reject is worse than leaving the slot empty. Never overwrites a slot the
 * reader has already filled.
 */
watch(
  [matchType, defaultPartnerId, registeredPlayers],
  () => {
    if (matchType.value !== 'doubles' || team1Player2.value) return
    const duo = defaultPartnerId.value
    if (!duo || duo === myProfile.value?.id) return
    const mate = registeredPlayers.value.find((p) => p.id === duo)
    if (mate && team2Player1.value?.id !== duo && team2Player2.value?.id !== duo) {
      team1Player2.value = mate
    }
  },
  { immediate: true }
)

function selectPlayer(player: RegisteredPlayer) {
  if (activeSearchField.value === 'team1Player1') team1Player1.value = player
  else if (activeSearchField.value === 'team1Player2') team1Player2.value = player
  else if (activeSearchField.value === 'team2Player1') team2Player1.value = player
  else if (activeSearchField.value === 'team2Player2') team2Player2.value = player
  searchQuery.value = ''
  activeSearchField.value = null
}

function clearPlayer(field: typeof activeSearchField.value) {
  if (field === 'team1Player1') team1Player1.value = null
  else if (field === 'team1Player2') team1Player2.value = null
  else if (field === 'team2Player1') team2Player1.value = null
  else if (field === 'team2Player2') team2Player2.value = null
}

function addGame() {
  if (games.value.length < 5) {
    games.value.push({ team1_score: null, team2_score: null })
  }
}

function removeGame(index: number) {
  if (games.value.length > 1) {
    games.value.splice(index, 1)
  }
}

const saving = ref(false)
const errorMessage = ref('')

const canSubmit = computed(() => {
  if (!eventId.value) return false
  if (!team1Player1.value || !team2Player1.value) return false
  if (matchType.value === 'doubles' && (!team1Player2.value || !team2Player2.value)) return false
  if (!playedAt.value) return false
  // The score rules live in one place now, so this cannot drift from what the
  // server accepts: every game must be finished and none may be unplayable,
  // and the result has to name a winner.
  return scoreProblems.value.length === 0 && result.value.winner !== null
})

async function handleSubmit() {
  errorMessage.value = ''
  if (!canSubmit.value) {
    errorMessage.value = 'Please fill in all required fields.'
    return
  }
  saving.value = true
  try {
    const participants = [{ player_id: team1Player1.value!.id, team_number: 1 }]
    if (matchType.value === 'doubles' && team1Player2.value) {
      participants.push({ player_id: team1Player2.value.id, team_number: 1 })
    }
    participants.push({ player_id: team2Player1.value!.id, team_number: 2 })
    if (matchType.value === 'doubles' && team2Player2.value) {
      participants.push({ player_id: team2Player2.value.id, team_number: 2 })
    }

    // set_number, not game_number: the API and match_scores still use the
    // older column name (see 046's note on why it is not being renamed).
    // Unplayed games are dropped rather than sent as zeros — an abandoned
    // match legitimately has fewer games than the format allows.
    const scores = games.value
      .filter((g) => g.team1_score !== null || g.team2_score !== null)
      .map((g, i) => ({
        set_number: i + 1,
        team1_score: g.team1_score ?? 0,
        team2_score: g.team2_score ?? 0
      }))

    const response = await $fetch<{ data: MatchDto }>('/api/v1/matches', {
      method: 'POST',
      body: {
        event_id: eventId.value,
        match_type: matchType.value,
        played_at: new Date(playedAt.value).toISOString(),
        venue: venue.value || null,
        result_type: resultType.value,
        winner_team: resultType.value === 'normal' ? null : result.value.winner,
        participants,
        scores
      }
    })
    await navigateTo(`/matches/${response.data.id}`)
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    errorMessage.value = fetchError.data?.message ?? 'Could not submit the match.'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  if (myProfile.value) {
    const me = registeredPlayers.value.find((p) => p.id === myProfile.value?.id)
    if (me) {
      team1Player1.value = me
    }
  }
})
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <UiPageHeader
        to="/matches"
        back-label="Matches"
        title="Record Match"
        subtitle="Submit a match from an event"
      />

      <!-- Pick which event this match was played in -->
      <div v-if="!eventId" class="rounded-xl bg-surface p-6 shadow-card">
        <h3 class="text-lg font-semibold text-fg">Which event was this?</h3>
        <p class="mt-1 text-sm text-fg-muted">
          Pick the event you played in. Only events you are registered for are listed.
        </p>

        <div v-if="myEventsPending" class="mt-5 space-y-2">
          <UiSkeleton v-for="n in 3" :key="n" height="4rem" />
        </div>

        <!-- Registration is what makes an event submittable, so someone with no
             registrations cannot be helped by a list - send them to find one. -->
        <div v-else-if="!myEvents.length" class="mt-5 rounded-lg bg-canvas p-6 text-center">
          <p class="text-sm text-fg-secondary">
            You are not registered for any events yet. Matches are submitted from an event you
            played in.
          </p>
          <NuxtLink
            to="/events"
            class="mt-4 inline-block rounded-lg bg-primary px-6 py-2.5 font-medium text-on-primary hover:bg-primary-hover"
          >
            Browse events
          </NuxtLink>
        </div>

        <ul v-else class="mt-5 space-y-2">
          <li v-for="option in myEvents" :key="option.id">
            <NuxtLink
              :to="`/matches/submit?event=${option.id}`"
              class="flex items-center justify-between gap-4 rounded-lg bg-canvas p-4 transition hover:bg-surface-3"
            >
              <span class="min-w-0">
                <span class="block truncate font-medium text-fg">{{ option.name }}</span>
                <span class="mt-0.5 block text-caption text-fg-muted">
                  {{ formatEventDate(option.start_date) }}
                  <template v-if="option.venue"> · {{ option.venue }}</template>
                </span>
              </span>
              <!-- Not UiStatusPill: its Status union is the match/club
                   vocabulary and has no 'published' or 'completed'. -->
              <span
                class="shrink-0 rounded-md px-2 py-0.5 text-caption font-medium capitalize"
                :class="
                  option.status === 'completed'
                    ? 'bg-surface-3 text-fg-secondary'
                    : 'bg-primary-soft text-primary'
                "
              >
                {{ option.status }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </div>

      <!-- Event Error -->
      <div v-else-if="eventError" class="rounded-xl bg-red-500/10 p-8 text-center">
        <p class="text-red-400">Could not load event.</p>
        <NuxtLink to="/events" class="mt-4 inline-block text-sm text-primary hover:underline">
          Back to events
        </NuxtLink>
      </div>

      <template v-else-if="eventData">
        <!-- Event Info Banner -->
        <div class="mb-6 rounded-xl bg-surface-2 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-fg-muted">Submitting match for</p>
              <h2 class="font-semibold text-fg">{{ eventData.name }}</h2>
              <p class="text-sm text-fg-secondary">
                {{ registeredPlayers.length }} registered player(s)
              </p>
            </div>
            <span
              class="rounded-md px-2 py-0.5 text-xs"
              :class="
                eventData.affects_rating ? 'bg-accent/20 text-accent' : 'bg-surface-3 text-fg-muted'
              "
            >
              {{ eventData.affects_rating ? 'Ranked' : 'Casual' }}
            </span>
          </div>
        </div>

        <!-- Form -->
        <form class="space-y-5" @submit.prevent="handleSubmit">
          <!-- Match Type -->
          <div class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="mb-4 font-semibold text-fg">Match Type</h2>
            <div class="flex gap-3">
              <button
                type="button"
                class="flex-1 rounded-lg border-2 py-3 font-medium transition-all"
                :class="
                  matchType === 'singles'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border-strong text-fg-muted hover:border-primary/50'
                "
                @click="matchType = 'singles'"
              >
                Singles
              </button>
              <button
                type="button"
                class="flex-1 rounded-lg border-2 py-3 font-medium transition-all"
                :class="
                  matchType === 'doubles'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border-strong text-fg-muted hover:border-primary/50'
                "
                @click="matchType = 'doubles'"
              >
                Doubles
              </button>
            </div>
          </div>

          <!-- Match Details -->
          <div class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="mb-4 font-semibold text-fg">Match Details</h2>
            <div class="space-y-4">
              <div>
                <label class="mb-1.5 block text-sm text-fg-secondary">Date & Time</label>
                <input
                  v-model="playedAt"
                  type="datetime-local"
                  required
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm text-fg-secondary">Court/Location</label>
                <input
                  v-model="venue"
                  type="text"
                  placeholder="Court name or number"
                  class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          <!-- Players -->
          <div class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="mb-4 font-semibold text-fg">Players</h2>
            <p class="mb-4 text-sm text-fg-muted">Select from registered players only</p>
            <div class="space-y-4">
              <!-- Team 1 -->
              <div class="rounded-lg bg-canvas p-4">
                <p class="mb-3 text-xs font-medium uppercase text-primary">Team 1</p>
                <div class="space-y-3">
                  <!-- Player 1 -->
                  <div class="relative">
                    <label class="mb-1.5 block text-sm text-fg-secondary">Player 1</label>
                    <div
                      v-if="team1Player1"
                      class="flex items-center justify-between rounded-lg bg-surface-2 p-3"
                    >
                      <div class="flex items-center gap-3">
                        <div
                          class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary"
                        >
                          {{ team1Player1.display_name.charAt(0) }}
                        </div>
                        <div>
                          <span class="text-fg">{{ team1Player1.display_name }}</span>
                          <span v-if="team1Player1.rating" class="ml-2 text-sm text-fg-muted">{{
                            team1Player1.rating.toFixed(2)
                          }}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="text-fg-muted hover:text-red-400"
                        @click="clearPlayer('team1Player1')"
                      >
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                    <div v-else>
                      <input
                        v-model="searchQuery"
                        type="text"
                        placeholder="Search registered players..."
                        class="w-full rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
                        @focus="activeSearchField = 'team1Player1'"
                      />
                      <div
                        v-if="activeSearchField === 'team1Player1' && filteredPlayers.length > 0"
                        class="absolute z-10 mt-1 w-full rounded-lg border border-border-strong bg-surface shadow-lg max-h-48 overflow-auto"
                      >
                        <button
                          v-for="player in filteredPlayers"
                          :key="player.id"
                          type="button"
                          class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                          @click="selectPlayer(player)"
                        >
                          <div
                            class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-sm font-bold text-fg-secondary"
                          >
                            {{ player.display_name.charAt(0) }}
                          </div>
                          <div>
                            <p class="text-sm font-medium text-fg">
                              {{ player.display_name }}
                              <span
                                v-if="player.id === defaultPartnerId"
                                class="ml-1 rounded-pill bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary"
                                >★ your duo</span
                              >
                            </p>
                            <p v-if="player.rating" class="text-xs text-fg-muted">
                              Rating: {{ player.rating.toFixed(2) }}
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Player 2 (Doubles) -->
                  <div v-if="matchType === 'doubles'" class="relative">
                    <label class="mb-1.5 block text-sm text-fg-secondary">Player 2</label>
                    <div
                      v-if="team1Player2"
                      class="flex items-center justify-between rounded-lg bg-surface-2 p-3"
                    >
                      <div class="flex items-center gap-3">
                        <div
                          class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary"
                        >
                          {{ team1Player2.display_name.charAt(0) }}
                        </div>
                        <div>
                          <span class="text-fg">{{ team1Player2.display_name }}</span>
                          <span v-if="team1Player2.rating" class="ml-2 text-sm text-fg-muted">{{
                            team1Player2.rating.toFixed(2)
                          }}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="text-fg-muted hover:text-red-400"
                        @click="clearPlayer('team1Player2')"
                      >
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                    <div v-else>
                      <input
                        v-model="searchQuery"
                        type="text"
                        placeholder="Search registered players..."
                        class="w-full rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
                        @focus="activeSearchField = 'team1Player2'"
                      />
                      <div
                        v-if="activeSearchField === 'team1Player2' && filteredPlayers.length > 0"
                        class="absolute z-10 mt-1 w-full rounded-lg border border-border-strong bg-surface shadow-lg max-h-48 overflow-auto"
                      >
                        <button
                          v-for="player in filteredPlayers"
                          :key="player.id"
                          type="button"
                          class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                          @click="selectPlayer(player)"
                        >
                          <div
                            class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-sm font-bold text-fg-secondary"
                          >
                            {{ player.display_name.charAt(0) }}
                          </div>
                          <div>
                            <p class="text-sm font-medium text-fg">
                              {{ player.display_name }}
                              <span
                                v-if="player.id === defaultPartnerId"
                                class="ml-1 rounded-pill bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary"
                                >★ your duo</span
                              >
                            </p>
                            <p v-if="player.rating" class="text-xs text-fg-muted">
                              Rating: {{ player.rating.toFixed(2) }}
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Team 2 -->
              <div class="rounded-lg bg-canvas p-4">
                <p class="mb-3 text-xs font-medium uppercase text-red-400">Team 2</p>
                <div class="space-y-3">
                  <!-- Player 1 -->
                  <div class="relative">
                    <label class="mb-1.5 block text-sm text-fg-secondary">Player 1</label>
                    <div
                      v-if="team2Player1"
                      class="flex items-center justify-between rounded-lg bg-surface-2 p-3"
                    >
                      <div class="flex items-center gap-3">
                        <div
                          class="flex h-8 w-8 items-center justify-center rounded-full bg-red-400/80 text-sm font-bold text-white"
                        >
                          {{ team2Player1.display_name.charAt(0) }}
                        </div>
                        <div>
                          <span class="text-fg">{{ team2Player1.display_name }}</span>
                          <span v-if="team2Player1.rating" class="ml-2 text-sm text-fg-muted">{{
                            team2Player1.rating.toFixed(2)
                          }}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="text-fg-muted hover:text-red-400"
                        @click="clearPlayer('team2Player1')"
                      >
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                    <div v-else>
                      <input
                        v-model="searchQuery"
                        type="text"
                        placeholder="Search registered players..."
                        class="w-full rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
                        @focus="activeSearchField = 'team2Player1'"
                      />
                      <div
                        v-if="activeSearchField === 'team2Player1' && filteredPlayers.length > 0"
                        class="absolute z-10 mt-1 w-full rounded-lg border border-border-strong bg-surface shadow-lg max-h-48 overflow-auto"
                      >
                        <button
                          v-for="player in filteredPlayers"
                          :key="player.id"
                          type="button"
                          class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                          @click="selectPlayer(player)"
                        >
                          <div
                            class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-sm font-bold text-fg-secondary"
                          >
                            {{ player.display_name.charAt(0) }}
                          </div>
                          <div>
                            <p class="text-sm font-medium text-fg">
                              {{ player.display_name }}
                              <span
                                v-if="player.id === defaultPartnerId"
                                class="ml-1 rounded-pill bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary"
                                >★ your duo</span
                              >
                            </p>
                            <p v-if="player.rating" class="text-xs text-fg-muted">
                              Rating: {{ player.rating.toFixed(2) }}
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Player 2 (Doubles) -->
                  <div v-if="matchType === 'doubles'" class="relative">
                    <label class="mb-1.5 block text-sm text-fg-secondary">Player 2</label>
                    <div
                      v-if="team2Player2"
                      class="flex items-center justify-between rounded-lg bg-surface-2 p-3"
                    >
                      <div class="flex items-center gap-3">
                        <div
                          class="flex h-8 w-8 items-center justify-center rounded-full bg-red-400/80 text-sm font-bold text-white"
                        >
                          {{ team2Player2.display_name.charAt(0) }}
                        </div>
                        <div>
                          <span class="text-fg">{{ team2Player2.display_name }}</span>
                          <span v-if="team2Player2.rating" class="ml-2 text-sm text-fg-muted">{{
                            team2Player2.rating.toFixed(2)
                          }}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="text-fg-muted hover:text-red-400"
                        @click="clearPlayer('team2Player2')"
                      >
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                    <div v-else>
                      <input
                        v-model="searchQuery"
                        type="text"
                        placeholder="Search registered players..."
                        class="w-full rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
                        @focus="activeSearchField = 'team2Player2'"
                      />
                      <div
                        v-if="activeSearchField === 'team2Player2' && filteredPlayers.length > 0"
                        class="absolute z-10 mt-1 w-full rounded-lg border border-border-strong bg-surface shadow-lg max-h-48 overflow-auto"
                      >
                        <button
                          v-for="player in filteredPlayers"
                          :key="player.id"
                          type="button"
                          class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                          @click="selectPlayer(player)"
                        >
                          <div
                            class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-sm font-bold text-fg-secondary"
                          >
                            {{ player.display_name.charAt(0) }}
                          </div>
                          <div>
                            <p class="text-sm font-medium text-fg">
                              {{ player.display_name }}
                              <span
                                v-if="player.id === defaultPartnerId"
                                class="ml-1 rounded-pill bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary"
                                >★ your duo</span
                              >
                            </p>
                            <p v-if="player.rating" class="text-xs text-fg-muted">
                              Rating: {{ player.rating.toFixed(2) }}
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Score -->
          <div class="rounded-xl bg-surface p-5 shadow-card">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="font-semibold text-fg">Score</h2>
              <button
                v-if="games.length < 5"
                type="button"
                class="text-sm text-primary hover:underline"
                @click="addGame"
              >
                + Add game
              </button>
            </div>

            <!-- The paper score sheet: one row per side, one column per game.
                 The same component renders the match view and the boxscore, so
                 a result reads identically wherever it appears. -->
            <MatchScoreSheet
              v-model:games="games"
              :teams="scoreSheetTeams"
              :rules="rules"
              :result-type="resultType"
              :explicit-winner="explicitWinner"
            />

            <div class="mt-4 flex flex-wrap items-end gap-4">
              <label class="flex flex-col gap-1.5">
                <span class="text-xs text-fg-secondary">How did it end?</span>
                <select
                  v-model="resultType"
                  class="rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
                >
                  <option value="normal">Played out</option>
                  <option value="retired">Retired</option>
                  <option value="dq">Disqualification</option>
                  <option value="walkover">Walkover</option>
                </select>
              </label>

              <!-- Only when the score cannot settle it. A walkover may have no
                   game played at all, so nothing in the grid can name a side. -->
              <label v-if="resultType !== 'normal'" class="flex flex-col gap-1.5">
                <span class="text-xs text-fg-secondary">Which side advances?</span>
                <select
                  v-model="explicitWinner"
                  class="rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none"
                >
                  <option :value="null">From the score</option>
                  <option :value="1">Team 1</option>
                  <option :value="2">Team 2</option>
                </select>
              </label>

              <button
                v-if="games.length > 1"
                type="button"
                class="pb-2 text-sm text-fg-muted hover:text-danger"
                @click="removeGame(games.length - 1)"
              >
                Remove last game
              </button>
            </div>

            <!-- Says what is missing rather than only disabling submit. -->
            <p v-if="result.winner" class="mt-4 text-sm text-fg-secondary">
              <span class="font-medium text-fg">{{ winnerLabel }}</span> wins.
            </p>
            <ul v-else-if="scoreProblems.length" class="mt-4 space-y-1">
              <li v-for="problem in scoreProblems" :key="problem" class="text-sm text-warning">
                {{ problem }}
              </li>
            </ul>
            <p v-else-if="result.problem" class="mt-4 text-sm text-fg-muted">
              {{ result.problem }}
            </p>
          </div>

          <!-- Error -->
          <div v-if="errorMessage" class="rounded-xl bg-red-500/10 p-4 text-red-400">
            {{ errorMessage }}
          </div>

          <!-- Actions -->
          <div class="flex gap-3">
            <NuxtLink
              :to="`/events/${eventId}`"
              class="flex-1 rounded-xl border border-border-strong py-3 text-center font-medium text-fg-secondary hover:bg-surface-2"
            >
              Cancel
            </NuxtLink>
            <button
              type="submit"
              :disabled="saving || !canSubmit"
              class="flex-1 rounded-xl bg-primary py-3 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {{ saving ? 'Submitting...' : 'Submit Match' }}
            </button>
          </div>
        </form>
      </template>
    </div>
  </div>
</template>
