<script setup lang="ts">
import type { EventDto, EventQueueDto, EventRegistrationDto } from '~/server/domains/event/dto/event.dto'
import type { TournamentDto } from '~/server/domains/event/dto/tournament.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

interface TournamentsResponse {
  tournaments: TournamentDto[]
}

const route = useRoute()
const eventId = route.params.eventId as string
const user = useSupabaseUser()

const activeTab = ref<'info' | 'matches' | 'players' | 'rankings' | 'queue'>('info')

interface EventRankingEntry {
  rank: number
  player_id: string
  display_name: string
  matches_played: number
  wins: number
  losses: number
}

const { data: event, pending: eventPending, error: eventError, refresh: refreshEvent } = await useFetch<EventDto>(
  `/api/v1/events/${eventId}`
)

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')

const { data: tournamentsData, pending: tournamentsPending, error: tournamentsError } = await useFetch<TournamentsResponse>(
  `/api/v1/events/${eventId}/tournaments`
)

const { data: registrationsData, pending: registrationsPending, refresh: refreshRegistrations } = await useFetch<{ data: EventRegistrationDto[] }>(
  `/api/v1/events/${eventId}/registrations`
)

const { data: matchesData, pending: matchesPending, refresh: refreshMatches } = await useFetch<{ data: any[] }>(
  `/api/v1/events/${eventId}/matches`
)

const { data: rankingsData, pending: rankingsPending } = await useFetch<{ data: EventRankingEntry[] }>(
  `/api/v1/events/${eventId}/rankings`
)

const { data: queueData, pending: queuePending, refresh: refreshQueue } = await useFetch<{ data: EventQueueDto[] }>(
  `/api/v1/events/${eventId}/queue`
)

const myRegistration = computed(() => {
  if (!myProfile.value || !registrationsData.value?.data) return null
  return registrationsData.value.data.find(r =>
    r.player_id === myProfile.value!.id && r.status !== 'withdrawn'
  )
})

const isRegistered = computed(() => !!myRegistration.value)
const isOrganizer = computed(
  () => !!myProfile.value && !!event.value && event.value.created_by_player_id === myProfile.value.id
)

const myQueueEntry = computed(() => {
  if (!myProfile.value || !queueData.value?.data) return null
  return queueData.value.data.find(q => q.player_id === myProfile.value!.id) ?? null
})

const waitingEntries = computed(() => queueData.value?.data.filter(q => q.status === 'waiting') ?? [])
const activeEntries = computed(() => queueData.value?.data.filter(q => q.status !== 'waiting') ?? [])

const joinMatchType = ref<'singles' | 'doubles'>('singles')
const joinPartnerId = ref('')
const joiningQueue = ref(false)
const leavingQueue = ref(false)
const queueError = ref('')

const availablePartners = computed(() => {
  if (!registrationsData.value?.data) return []
  return registrationsData.value.data.filter(
    r => r.status !== 'withdrawn' && r.player_id !== myProfile.value?.id
  )
})

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
  } catch (err: any) {
    queueError.value = err.data?.message || 'Failed to join the queue.'
  } finally {
    joiningQueue.value = false
  }
}

async function handleLeaveQueue() {
  leavingQueue.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/queue/leave`, { method: 'POST' })
    await refreshQueue()
  } catch (err: any) {
    queueError.value = err.data?.message || 'Failed to leave the queue.'
  } finally {
    leavingQueue.value = false
  }
}

const selectedEntry1 = ref('')
const selectedEntry2 = ref('')
const matchCourtNumber = ref('')
const matchingQueue = ref(false)

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
  } catch (err: any) {
    queueError.value = err.data?.message || 'Failed to match these players.'
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
  } catch (err: any) {
    queueError.value = err.data?.message || 'Failed to skip this player.'
  }
}

const registering = ref(false)
const withdrawing = ref(false)
const checkingIn = ref(false)

async function handleRegister() {
  if (!user.value) {
    await navigateTo('/login')
    return
  }
  registering.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/register`, { method: 'POST' })
    await refreshRegistrations()
  } catch (err: any) {
    alert(err.data?.message || 'Failed to register')
  } finally {
    registering.value = false
  }
}

async function handleWithdraw() {
  if (!confirm('Are you sure you want to withdraw from this event?')) return
  withdrawing.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/withdraw`, { method: 'POST' })
    await refreshRegistrations()
  } catch (err: any) {
    alert(err.data?.message || 'Failed to withdraw')
  } finally {
    withdrawing.value = false
  }
}

async function handleCheckIn() {
  checkingIn.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/check-in`, { method: 'POST' })
    await refreshRegistrations()
  } catch (err: any) {
    alert(err.data?.message || 'Failed to check in')
  } finally {
    checkingIn.value = false
  }
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-[#3A5750]', text: 'text-[#6B7B75]' },
  published: { bg: 'bg-[#4DB175]/20', text: 'text-[#4DB175]' },
  active: { bg: 'bg-[#4DB175]/20', text: 'text-[#4DB175]' },
  open: { bg: 'bg-[#4DB175]/20', text: 'text-[#4DB175]' },
  in_progress: { bg: 'bg-[#4DB175]/20', text: 'text-[#4DB175]' },
  completed: { bg: 'bg-[#B5B9F0]/20', text: 'text-[#B5B9F0]' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' }
}

const eventTypeLabels: Record<string, string> = {
  open_casual: 'Open Casual',
  open_ranked: 'Open Ranked',
  club_casual: 'Club Casual',
  club_ranked: 'Club Ranked',
  tournament: 'Tournament'
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const startStr = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endStr = endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  if (startStr === endStr.replace(/, \d{4}$/, '')) {
    return endStr
  }
  return `${startStr} - ${endStr}`
}

function formatScore(scores: { team1_score: number; team2_score: number }[]): string {
  return scores.map(s => `${s.team1_score}-${s.team2_score}`).join(', ')
}

const publishing = ref(false)

async function handlePublishEvent() {
  if (!confirm('Publish this event? It will become visible to all players.')) return
  publishing.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/publish`, { method: 'POST' })
    await refreshEvent()
  } catch (err: any) {
    alert(err.data?.message || 'Failed to publish event')
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-4xl">
      <!-- Loading -->
      <div v-if="eventPending" class="space-y-4">
        <div class="h-36 animate-pulse rounded-xl bg-[#1E2E2A]" />
        <div class="h-48 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Error -->
      <div v-else-if="eventError" class="rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">Could not load event.</p>
        <NuxtLink to="/events" class="mt-4 inline-block text-sm text-[#4DB175] hover:underline">
          Back to events
        </NuxtLink>
      </div>

      <template v-else-if="event">
        <!-- Event Header -->
        <div class="mb-6 rounded-xl bg-[#1E2E2A] p-6">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h1 class="text-2xl font-bold text-white">{{ event.name }}</h1>
                <span
                  class="rounded-md px-2 py-0.5 text-xs font-medium"
                  :class="event.affects_rating ? 'bg-[#B5B9F0]/20 text-[#B5B9F0]' : 'bg-[#3A5750] text-[#6B7B75]'"
                >
                  {{ event.affects_rating ? 'Ranked' : 'Casual' }}
                </span>
              </div>
              <p class="mt-1 text-sm text-[#4DB175]">{{ eventTypeLabels[event.event_type] || event.event_type }}</p>
              <p class="mt-2 text-[#6B7B75]">
                {{ formatDateRange(event.start_date, event.end_date) }}
              </p>
              <p v-if="event.venue || event.city" class="text-[#6B7B75]">
                {{ [event.venue, event.city].filter(Boolean).join(', ') }}
              </p>
              <div v-if="event.fee_amount" class="mt-2 text-[#A6ABA7]">
                Fee: {{ event.fee_currency || 'PHP' }} {{ event.fee_amount }}
              </div>
              <div v-if="event.max_participants" class="text-sm text-[#6B7B75]">
                {{ registrationsData?.data.length || 0 }} / {{ event.max_participants }} players
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
                v-if="isOrganizer && event.status === 'draft'"
                :disabled="publishing"
                class="rounded-lg bg-[#4DB175] px-4 py-2 text-sm font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
                @click="handlePublishEvent"
              >
                {{ publishing ? 'Publishing...' : 'Publish Event' }}
              </button>

              <!-- Registration Actions -->
              <template v-if="event.status === 'published' || event.status === 'active'">
                <button
                  v-if="!isRegistered"
                  class="rounded-lg bg-[#4DB175] px-4 py-2 text-sm font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
                  :disabled="registering"
                  @click="handleRegister"
                >
                  {{ registering ? 'Registering...' : 'Register' }}
                </button>
                <template v-else>
                  <span class="text-sm text-[#4DB175]">
                    {{ myRegistration?.status === 'checked_in' ? 'Checked In' : 'Registered' }}
                  </span>
                  <button
                    v-if="myRegistration?.status === 'registered' && event.status === 'active'"
                    class="rounded-lg bg-[#4DB175] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
                    :disabled="checkingIn"
                    @click="handleCheckIn"
                  >
                    {{ checkingIn ? 'Checking in...' : 'Check In' }}
                  </button>
                  <button
                    class="text-xs text-[#6B7B75] hover:text-red-400"
                    :disabled="withdrawing"
                    @click="handleWithdraw"
                  >
                    {{ withdrawing ? 'Withdrawing...' : 'Withdraw' }}
                  </button>
                </template>
              </template>
            </div>
          </div>
          <p v-if="event.description" class="mt-4 text-[#A6ABA7]">
            {{ event.description }}
          </p>
        </div>

        <!-- Tabs -->
        <div class="mb-4 flex gap-1 rounded-lg bg-[#1E2E2A] p-1">
          <button
            v-for="tab in ['info', 'matches', 'players', 'rankings', 'queue'] as const"
            :key="tab"
            class="flex-1 rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors"
            :class="activeTab === tab
              ? 'bg-[#4DB175] text-white'
              : 'text-[#6B7B75] hover:bg-[#2E4540] hover:text-white'"
            @click="activeTab = tab"
          >
            {{ tab }}
            <span v-if="tab === 'players' && registrationsData?.data" class="ml-1 text-xs opacity-75">
              ({{ registrationsData.data.length }})
            </span>
            <span v-if="tab === 'matches' && matchesData?.data" class="ml-1 text-xs opacity-75">
              ({{ matchesData.data.length }})
            </span>
          </button>
        </div>

        <!-- Tab Content: Info -->
        <div v-if="activeTab === 'info'" class="space-y-4">
          <!-- Tournaments (for tournament type) -->
          <div v-if="event.event_type === 'tournament'" class="rounded-xl bg-[#1E2E2A] p-6">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold text-white">Tournaments</h2>
              <NuxtLink
                v-if="isOrganizer"
                :to="`/events/${eventId}/create-tournament`"
                class="inline-flex items-center gap-2 rounded-lg bg-[#4DB175] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#5FC287]"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Category
              </NuxtLink>
            </div>

            <div v-if="tournamentsPending" class="space-y-3">
              <div v-for="i in 3" :key="i" class="h-20 animate-pulse rounded-lg bg-[#0B0D09]" />
            </div>
            <div v-else-if="tournamentsError" class="rounded-lg bg-red-500/10 p-4 text-center">
              <p class="text-red-400">Could not load tournaments.</p>
            </div>
            <div v-else-if="!tournamentsData?.tournaments.length" class="text-center">
              <p class="text-[#6B7B75]">No tournaments yet.</p>
            </div>
            <div v-else class="space-y-3">
              <NuxtLink
                v-for="tournament in tournamentsData.tournaments"
                :key="tournament.id"
                :to="`/tournaments/${tournament.id}`"
                class="block rounded-lg bg-[#0B0D09] p-4 transition-all hover:bg-[#2E4540]"
              >
                <div class="flex items-start justify-between">
                  <div>
                    <h3 class="font-medium text-white">{{ tournament.name }}</h3>
                    <p class="mt-1 text-sm text-[#6B7B75]">
                      <span class="capitalize">{{ tournament.format.replace(/_/g, ' ') }}</span>
                      <span class="mx-1">·</span>
                      <span class="capitalize">{{ tournament.match_type }}</span>
                    </p>
                  </div>
                  <span
                    class="rounded-md px-2 py-0.5 text-xs font-medium capitalize"
                    :class="statusConfig[tournament.status]?.bg + ' ' + statusConfig[tournament.status]?.text"
                  >
                    {{ tournament.status }}
                  </span>
                </div>
              </NuxtLink>
            </div>
          </div>

          <!-- Submit Match Button (for non-tournament types) -->
          <div v-if="event.event_type !== 'tournament' && isRegistered && event.status === 'active'" class="rounded-xl bg-[#1E2E2A] p-6">
            <NuxtLink
              :to="`/matches/submit?event=${eventId}`"
              class="block w-full rounded-lg bg-[#4DB175] py-3 text-center font-medium text-white hover:bg-[#5FC287]"
            >
              Record Match
            </NuxtLink>
          </div>

          <!-- Queue Settings Info -->
          <div v-if="event.queue_enabled" class="rounded-xl bg-[#1E2E2A] p-6">
            <h2 class="mb-3 text-lg font-semibold text-white">Queue System</h2>
            <p class="text-[#A6ABA7]">
              This event has matchmaking queue enabled with {{ event.queue_courts }} court(s).
              Mode: <span class="capitalize">{{ event.queue_mode.replace('_', ' ') }}</span>
            </p>
            <p class="mt-2 text-sm text-[#6B7B75]">
              Auto-matching coming soon. Currently, the organizer assigns matches manually.
            </p>
          </div>
        </div>

        <!-- Tab Content: Matches -->
        <div v-if="activeTab === 'matches'" class="rounded-xl bg-[#1E2E2A] p-6">
          <div v-if="matchesPending" class="space-y-3">
            <div v-for="i in 5" :key="i" class="h-16 animate-pulse rounded-lg bg-[#0B0D09]" />
          </div>
          <div v-else-if="!matchesData?.data.length" class="text-center py-8">
            <p class="text-[#6B7B75]">No matches recorded yet.</p>
          </div>
          <div v-else class="space-y-3">
            <NuxtLink
              v-for="match in matchesData.data"
              :key="match.id"
              :to="`/matches/${match.id}`"
              class="block rounded-lg bg-[#0B0D09] p-4 transition-all hover:bg-[#2E4540]"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-sm capitalize text-[#6B7B75]">{{ match.match_type }}</span>
                    <span
                      class="rounded px-2 py-0.5 text-xs"
                      :class="statusConfig[match.status]?.bg + ' ' + statusConfig[match.status]?.text"
                    >
                      {{ match.status }}
                    </span>
                  </div>
                  <div class="mt-1 text-white">
                    <span v-for="(p, i) in match.participants.filter((pp: any) => pp.team_number === 1)" :key="p.player_id">
                      {{ Number(i) > 0 ? ' & ' : '' }}{{ p.display_name }}
                    </span>
                    <span class="mx-2 text-[#6B7B75]">vs</span>
                    <span v-for="(p, i) in match.participants.filter((pp: any) => pp.team_number === 2)" :key="p.player_id">
                      {{ Number(i) > 0 ? ' & ' : '' }}{{ p.display_name }}
                    </span>
                  </div>
                  <div class="mt-1 text-sm text-[#4DB175]">
                    {{ formatScore(match.scores) }}
                  </div>
                </div>
                <div class="text-right text-sm text-[#6B7B75]">
                  {{ new Date(match.played_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Tab Content: Players -->
        <div v-if="activeTab === 'players'" class="rounded-xl bg-[#1E2E2A] p-6">
          <div v-if="registrationsPending" class="space-y-3">
            <div v-for="i in 5" :key="i" class="h-12 animate-pulse rounded-lg bg-[#0B0D09]" />
          </div>
          <div v-else-if="!registrationsData?.data.length" class="text-center py-8">
            <p class="text-[#6B7B75]">No players registered yet.</p>
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="reg in registrationsData.data"
              :key="reg.id"
              class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3"
            >
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[#2E4540] text-sm font-medium text-white">
                  {{ reg.player?.display_name?.charAt(0) || '?' }}
                </div>
                <div>
                  <NuxtLink :to="`/players/${reg.player_id}`" class="font-medium text-white hover:text-[#4DB175]">
                    {{ reg.player?.display_name || 'Unknown' }}
                  </NuxtLink>
                  <p v-if="reg.player?.rating" class="text-sm text-[#6B7B75]">
                    Rating: {{ reg.player.rating.toFixed(2) }}
                  </p>
                </div>
              </div>
              <div class="text-right">
                <span
                  class="rounded px-2 py-0.5 text-xs"
                  :class="reg.status === 'checked_in' ? 'bg-[#4DB175]/20 text-[#4DB175]' : 'bg-[#3A5750] text-[#6B7B75]'"
                >
                  {{ reg.status === 'checked_in' ? 'Checked In' : 'Registered' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab Content: Rankings -->
        <div v-if="activeTab === 'rankings'" class="rounded-xl bg-[#1E2E2A] p-6">
          <div v-if="rankingsPending" class="space-y-3">
            <div v-for="i in 5" :key="i" class="h-12 animate-pulse rounded-lg bg-[#0B0D09]" />
          </div>
          <div v-else-if="!rankingsData?.data.length" class="text-center py-8">
            <p class="text-[#6B7B75]">No verified matches yet — rankings appear once matches are confirmed.</p>
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="entry in rankingsData.data"
              :key="entry.player_id"
              class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3"
            >
              <div class="flex items-center gap-3">
                <span class="flex h-7 w-7 items-center justify-center rounded-full bg-[#2E4540] text-xs font-medium text-[#A6ABA7]">
                  {{ entry.rank }}
                </span>
                <NuxtLink :to="`/players/${entry.player_id}`" class="font-medium text-white hover:text-[#4DB175]">
                  {{ entry.display_name }}
                </NuxtLink>
              </div>
              <div class="text-right text-sm">
                <span class="text-[#4DB175]">{{ entry.wins }}W</span>
                <span class="mx-1 text-[#6B7B75]">-</span>
                <span class="text-red-400">{{ entry.losses }}L</span>
                <span class="ml-2 text-[#6B7B75]">({{ entry.matches_played }} played)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab Content: Queue -->
        <div v-if="activeTab === 'queue'" class="space-y-4">
          <template v-if="event.queue_enabled">
            <div class="rounded-xl bg-[#1E2E2A] p-6">
              <p class="text-sm text-[#6B7B75]">
                {{ event.queue_courts }} court(s) · {{ event.queue_mode.replace('_', ' ') }} mode
              </p>

              <div v-if="queueError" class="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                {{ queueError }}
              </div>

              <!-- Join / Leave -->
              <div v-if="isRegistered && !isOrganizer" class="mt-4">
                <div v-if="myQueueEntry" class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-4">
                  <div>
                    <p class="font-medium text-white">You're in the queue</p>
                    <p class="text-sm text-[#6B7B75]">
                      Status: <span class="capitalize">{{ myQueueEntry.status }}</span>
                      <span v-if="myQueueEntry.court_number"> · Court {{ myQueueEntry.court_number }}</span>
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
                <div v-else class="flex flex-wrap items-end gap-3 rounded-lg bg-[#0B0D09] p-4">
                  <div>
                    <label class="mb-1.5 block text-xs text-[#A6ABA7]">Match Type</label>
                    <select
                      v-model="joinMatchType"
                      class="rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-sm text-white focus:border-[#4DB175] focus:outline-none"
                    >
                      <option value="singles">Singles</option>
                      <option value="doubles">Doubles</option>
                    </select>
                  </div>
                  <div v-if="joinMatchType === 'doubles'">
                    <label class="mb-1.5 block text-xs text-[#A6ABA7]">Partner</label>
                    <select
                      v-model="joinPartnerId"
                      class="rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-sm text-white focus:border-[#4DB175] focus:outline-none"
                    >
                      <option value="" disabled>Select partner</option>
                      <option v-for="p in availablePartners" :key="p.player_id" :value="p.player_id">
                        {{ p.player?.display_name || 'Unknown' }}
                      </option>
                    </select>
                  </div>
                  <button
                    :disabled="joiningQueue"
                    class="rounded-lg bg-[#4DB175] px-4 py-2 text-sm font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
                    @click="handleJoinQueue"
                  >
                    {{ joiningQueue ? 'Joining...' : 'Join Queue' }}
                  </button>
                </div>
              </div>
              <p v-else-if="!isOrganizer" class="mt-4 text-sm text-[#6B7B75]">
                Register for this event to join the queue.
              </p>

              <!-- Organizer: match waiting players -->
              <div v-if="isOrganizer" class="mt-4 rounded-lg bg-[#0B0D09] p-4">
                <h3 class="mb-3 text-sm font-semibold text-white">Match Waiting Players</h3>
                <div v-if="waitingEntries.length < 2" class="text-sm text-[#6B7B75]">
                  Need at least 2 waiting players to create a match.
                </div>
                <div v-else class="flex flex-wrap items-end gap-3">
                  <select
                    v-model="selectedEntry1"
                    class="rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-sm text-white focus:border-[#4DB175] focus:outline-none"
                  >
                    <option value="" disabled>Player/Pair 1</option>
                    <option v-for="e in waitingEntries" :key="e.id" :value="e.id">
                      {{ e.player?.display_name }}{{ e.partner ? ` & ${e.partner.display_name}` : '' }}
                    </option>
                  </select>
                  <select
                    v-model="selectedEntry2"
                    class="rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-sm text-white focus:border-[#4DB175] focus:outline-none"
                  >
                    <option value="" disabled>Player/Pair 2</option>
                    <option v-for="e in waitingEntries" :key="e.id" :value="e.id">
                      {{ e.player?.display_name }}{{ e.partner ? ` & ${e.partner.display_name}` : '' }}
                    </option>
                  </select>
                  <input
                    v-model="matchCourtNumber"
                    type="number"
                    min="1"
                    :max="event.queue_courts"
                    placeholder="Court #"
                    class="w-24 rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-sm text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
                  />
                  <button
                    :disabled="matchingQueue"
                    class="rounded-lg bg-[#4DB175] px-4 py-2 text-sm font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
                    @click="handleMatchEntries"
                  >
                    {{ matchingQueue ? 'Matching...' : 'Match' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Queue List -->
            <div class="rounded-xl bg-[#1E2E2A] p-6">
              <h3 class="mb-4 font-semibold text-white">Waiting ({{ waitingEntries.length }})</h3>
              <div v-if="queuePending" class="space-y-3">
                <div v-for="i in 3" :key="i" class="h-14 animate-pulse rounded-lg bg-[#0B0D09]" />
              </div>
              <div v-else-if="waitingEntries.length === 0" class="text-center py-6">
                <p class="text-[#6B7B75]">No one is waiting in the queue.</p>
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="(e, i) in waitingEntries"
                  :key="e.id"
                  class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3"
                >
                  <div class="flex items-center gap-3">
                    <span class="flex h-7 w-7 items-center justify-center rounded-full bg-[#2E4540] text-xs font-medium text-[#A6ABA7]">
                      {{ i + 1 }}
                    </span>
                    <span class="text-white">
                      {{ e.player?.display_name }}{{ e.partner ? ` & ${e.partner.display_name}` : '' }}
                    </span>
                    <span class="text-xs capitalize text-[#6B7B75]">{{ e.match_type }}</span>
                  </div>
                  <button
                    v-if="isOrganizer"
                    class="text-xs text-[#6B7B75] hover:text-red-400"
                    @click="handleSkipEntry(e.id)"
                  >
                    Skip
                  </button>
                </div>
              </div>

              <div v-if="activeEntries.length > 0" class="mt-6">
                <h3 class="mb-3 font-semibold text-white">On Court</h3>
                <div class="space-y-2">
                  <div
                    v-for="e in activeEntries"
                    :key="e.id"
                    class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3"
                  >
                    <span class="text-white">
                      {{ e.player?.display_name }}{{ e.partner ? ` & ${e.partner.display_name}` : '' }}
                    </span>
                    <span class="text-sm text-[#4DB175]">Court {{ e.court_number }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="rounded-xl bg-[#1E2E2A] p-6 text-center py-8">
              <p class="text-[#6B7B75]">Queue system is not enabled for this event.</p>
            </div>
          </template>
        </div>

        <!-- Back Link -->
        <div class="mt-6 text-center">
          <NuxtLink to="/events" class="text-sm text-[#4DB175] hover:underline">
            Back to events
          </NuxtLink>
        </div>
      </template>
    </div>
  </div>
</template>
