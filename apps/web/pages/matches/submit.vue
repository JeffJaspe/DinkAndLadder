<script setup lang="ts">
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { MatchDto } from '~/server/domains/match/dto/match.dto'
import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'

interface PlayerSearchResult {
  id: string
  display_name: string
  city?: string
  province?: string
}

const route = useRoute()
const preselectedClubId = computed(() => route.query.club as string | undefined)

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')
const { data: myClubsData } = await useFetch<{ items: MyClubMembershipDto[] }>('/api/v1/clubs/mine')

const adminClubs = computed(() => {
  if (!myClubsData.value?.items) return []
  return myClubsData.value.items.filter(m => m.role === 'OWNER' || m.role === 'ADMIN')
})

const selectedClubId = ref(preselectedClubId.value || '')
const matchType = ref<'singles' | 'doubles'>('singles')
const playedAt = ref('')
const venue = ref('')

const team1Player1 = ref<PlayerSearchResult | null>(null)
const team1Player2 = ref<PlayerSearchResult | null>(null)
const team2Player1 = ref<PlayerSearchResult | null>(null)
const team2Player2 = ref<PlayerSearchResult | null>(null)

const sets = ref([{ team1Score: '', team2Score: '' }])

const searchQuery = ref('')
const searchResults = ref<PlayerSearchResult[]>([])
const searchLoading = ref(false)
const activeSearchField = ref<'team1Player1' | 'team1Player2' | 'team2Player1' | 'team2Player2' | null>(null)

let searchDebounce: ReturnType<typeof setTimeout> | null = null

async function searchPlayers(query: string) {
  if (!query || query.length < 2) {
    searchResults.value = []
    return
  }
  searchLoading.value = true
  try {
    const response = await $fetch<{ players: PlayerSearchResult[] }>('/api/v1/players/search', {
      query: { q: query, limit: 10 }
    })
    searchResults.value = response.players
  } catch {
    searchResults.value = []
  } finally {
    searchLoading.value = false
  }
}

function onSearchInput(field: typeof activeSearchField.value) {
  activeSearchField.value = field
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => searchPlayers(searchQuery.value), 300)
}

function selectPlayer(player: PlayerSearchResult) {
  if (activeSearchField.value === 'team1Player1') team1Player1.value = player
  else if (activeSearchField.value === 'team1Player2') team1Player2.value = player
  else if (activeSearchField.value === 'team2Player1') team2Player1.value = player
  else if (activeSearchField.value === 'team2Player2') team2Player2.value = player
  searchQuery.value = ''
  searchResults.value = []
  activeSearchField.value = null
}

function clearPlayer(field: typeof activeSearchField.value) {
  if (field === 'team1Player1') team1Player1.value = null
  else if (field === 'team1Player2') team1Player2.value = null
  else if (field === 'team2Player1') team2Player1.value = null
  else if (field === 'team2Player2') team2Player2.value = null
}

function addSet() {
  if (sets.value.length < 5) {
    sets.value.push({ team1Score: '', team2Score: '' })
  }
}

function removeSet(index: number) {
  if (sets.value.length > 1) {
    sets.value.splice(index, 1)
  }
}

const saving = ref(false)
const errorMessage = ref('')

const canSubmit = computed(() => {
  if (!selectedClubId.value) return false
  if (!team1Player1.value || !team2Player1.value) return false
  if (matchType.value === 'doubles' && (!team1Player2.value || !team2Player2.value)) return false
  if (!playedAt.value) return false
  return sets.value.every(s => s.team1Score !== '' && s.team2Score !== '')
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

    const scores = sets.value.map((s, i) => ({
      set_number: i + 1,
      team1_score: Number(s.team1Score),
      team2_score: Number(s.team2Score)
    }))

    const response = await $fetch<{ data: MatchDto }>('/api/v1/matches', {
      method: 'POST',
      body: {
        club_id: selectedClubId.value,
        match_type: matchType.value,
        played_at: new Date(playedAt.value).toISOString(),
        venue: venue.value || null,
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
  if (preselectedClubId.value) {
    selectedClubId.value = preselectedClubId.value
  }
})
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-white">Submit Match</h1>
        <p class="mt-1 text-sm text-[#6B7B75]">Record a match played at your club</p>
      </div>

      <!-- No Admin Clubs -->
      <div v-if="adminClubs.length === 0" class="rounded-xl bg-[#1E2E2A] p-8 text-center">
        <p class="text-4xl">🏸</p>
        <h3 class="mt-4 text-lg font-semibold text-white">No Club Admin Access</h3>
        <p class="mt-2 text-sm text-[#6B7B75]">
          You need to be an owner or admin of a club to submit matches.
        </p>
        <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <NuxtLink
            to="/create-club"
            class="rounded-lg bg-[#4DB175] px-6 py-2.5 font-medium text-white hover:bg-[#5FC287]"
          >
            Create a Club
          </NuxtLink>
          <NuxtLink
            to="/clubs"
            class="rounded-lg border border-[#3A5750] px-6 py-2.5 font-medium text-[#A6ABA7] hover:bg-[#2E4540]"
          >
            Browse Clubs
          </NuxtLink>
        </div>
      </div>

      <!-- Form -->
      <form v-else class="space-y-5" @submit.prevent="handleSubmit">
        <!-- Club Selection -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Club</h2>
          <select
            v-model="selectedClubId"
            required
            class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
          >
            <option value="" disabled>Select a club</option>
            <option v-for="membership in adminClubs" :key="membership.club.id" :value="membership.club.id">
              {{ membership.club.name }} ({{ membership.role }})
            </option>
          </select>
        </div>

        <!-- Match Type -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Match Type</h2>
          <div class="flex gap-3">
            <button
              type="button"
              class="flex-1 rounded-lg border-2 py-3 font-medium transition-all"
              :class="matchType === 'singles'
                ? 'border-[#4DB175] bg-[#4DB175]/10 text-[#4DB175]'
                : 'border-[#3A5750] text-[#6B7B75] hover:border-[#4DB175]/50'"
              @click="matchType = 'singles'"
            >
              Singles
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg border-2 py-3 font-medium transition-all"
              :class="matchType === 'doubles'
                ? 'border-[#4DB175] bg-[#4DB175]/10 text-[#4DB175]'
                : 'border-[#3A5750] text-[#6B7B75] hover:border-[#4DB175]/50'"
              @click="matchType = 'doubles'"
            >
              Doubles
            </button>
          </div>
        </div>

        <!-- Match Details -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Match Details</h2>
          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Date & Time</label>
              <input
                v-model="playedAt"
                type="datetime-local"
                required
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Venue</label>
              <input
                v-model="venue"
                type="text"
                placeholder="Court name or location"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <!-- Players -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Players</h2>
          <div class="space-y-4">
            <!-- Team 1 -->
            <div class="rounded-lg bg-[#0B0D09] p-4">
              <p class="mb-3 text-xs font-medium uppercase text-[#4DB175]">Team 1</p>
              <div class="space-y-3">
                <!-- Player 1 -->
                <div class="relative">
                  <label class="mb-1.5 block text-sm text-[#A6ABA7]">Player 1</label>
                  <div v-if="team1Player1" class="flex items-center justify-between rounded-lg bg-[#2E4540] p-3">
                    <div class="flex items-center gap-3">
                      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#4DB175] text-sm font-bold text-white">
                        {{ team1Player1.display_name.charAt(0) }}
                      </div>
                      <span class="text-white">{{ team1Player1.display_name }}</span>
                    </div>
                    <button type="button" class="text-[#6B7B75] hover:text-red-400" @click="clearPlayer('team1Player1')">
                      <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div v-else>
                    <input
                      v-model="searchQuery"
                      type="text"
                      placeholder="Search by name..."
                      class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
                      @input="onSearchInput('team1Player1')"
                      @focus="activeSearchField = 'team1Player1'"
                    />
                    <div v-if="activeSearchField === 'team1Player1' && (searchResults.length > 0 || searchLoading)" class="absolute z-10 mt-1 w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] shadow-lg">
                      <div v-if="searchLoading" class="p-3 text-center text-sm text-[#6B7B75]">Searching...</div>
                      <button
                        v-for="player in searchResults"
                        :key="player.id"
                        type="button"
                        class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#2E4540]"
                        @click="selectPlayer(player)"
                      >
                        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#3A5750] text-sm font-bold text-[#A6ABA7]">
                          {{ player.display_name.charAt(0) }}
                        </div>
                        <div>
                          <p class="text-sm font-medium text-white">{{ player.display_name }}</p>
                          <p v-if="player.city" class="text-xs text-[#6B7B75]">{{ player.city }}</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Player 2 (Doubles) -->
                <div v-if="matchType === 'doubles'" class="relative">
                  <label class="mb-1.5 block text-sm text-[#A6ABA7]">Player 2</label>
                  <div v-if="team1Player2" class="flex items-center justify-between rounded-lg bg-[#2E4540] p-3">
                    <div class="flex items-center gap-3">
                      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#4DB175] text-sm font-bold text-white">
                        {{ team1Player2.display_name.charAt(0) }}
                      </div>
                      <span class="text-white">{{ team1Player2.display_name }}</span>
                    </div>
                    <button type="button" class="text-[#6B7B75] hover:text-red-400" @click="clearPlayer('team1Player2')">
                      <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div v-else>
                    <input
                      v-model="searchQuery"
                      type="text"
                      placeholder="Search by name..."
                      class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
                      @input="onSearchInput('team1Player2')"
                      @focus="activeSearchField = 'team1Player2'"
                    />
                    <div v-if="activeSearchField === 'team1Player2' && (searchResults.length > 0 || searchLoading)" class="absolute z-10 mt-1 w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] shadow-lg">
                      <div v-if="searchLoading" class="p-3 text-center text-sm text-[#6B7B75]">Searching...</div>
                      <button
                        v-for="player in searchResults"
                        :key="player.id"
                        type="button"
                        class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#2E4540]"
                        @click="selectPlayer(player)"
                      >
                        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#3A5750] text-sm font-bold text-[#A6ABA7]">
                          {{ player.display_name.charAt(0) }}
                        </div>
                        <div>
                          <p class="text-sm font-medium text-white">{{ player.display_name }}</p>
                          <p v-if="player.city" class="text-xs text-[#6B7B75]">{{ player.city }}</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Team 2 -->
            <div class="rounded-lg bg-[#0B0D09] p-4">
              <p class="mb-3 text-xs font-medium uppercase text-red-400">Team 2</p>
              <div class="space-y-3">
                <!-- Player 1 -->
                <div class="relative">
                  <label class="mb-1.5 block text-sm text-[#A6ABA7]">Player 1</label>
                  <div v-if="team2Player1" class="flex items-center justify-between rounded-lg bg-[#2E4540] p-3">
                    <div class="flex items-center gap-3">
                      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-red-400/80 text-sm font-bold text-white">
                        {{ team2Player1.display_name.charAt(0) }}
                      </div>
                      <span class="text-white">{{ team2Player1.display_name }}</span>
                    </div>
                    <button type="button" class="text-[#6B7B75] hover:text-red-400" @click="clearPlayer('team2Player1')">
                      <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div v-else>
                    <input
                      v-model="searchQuery"
                      type="text"
                      placeholder="Search by name..."
                      class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
                      @input="onSearchInput('team2Player1')"
                      @focus="activeSearchField = 'team2Player1'"
                    />
                    <div v-if="activeSearchField === 'team2Player1' && (searchResults.length > 0 || searchLoading)" class="absolute z-10 mt-1 w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] shadow-lg">
                      <div v-if="searchLoading" class="p-3 text-center text-sm text-[#6B7B75]">Searching...</div>
                      <button
                        v-for="player in searchResults"
                        :key="player.id"
                        type="button"
                        class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#2E4540]"
                        @click="selectPlayer(player)"
                      >
                        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#3A5750] text-sm font-bold text-[#A6ABA7]">
                          {{ player.display_name.charAt(0) }}
                        </div>
                        <div>
                          <p class="text-sm font-medium text-white">{{ player.display_name }}</p>
                          <p v-if="player.city" class="text-xs text-[#6B7B75]">{{ player.city }}</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Player 2 (Doubles) -->
                <div v-if="matchType === 'doubles'" class="relative">
                  <label class="mb-1.5 block text-sm text-[#A6ABA7]">Player 2</label>
                  <div v-if="team2Player2" class="flex items-center justify-between rounded-lg bg-[#2E4540] p-3">
                    <div class="flex items-center gap-3">
                      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-red-400/80 text-sm font-bold text-white">
                        {{ team2Player2.display_name.charAt(0) }}
                      </div>
                      <span class="text-white">{{ team2Player2.display_name }}</span>
                    </div>
                    <button type="button" class="text-[#6B7B75] hover:text-red-400" @click="clearPlayer('team2Player2')">
                      <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div v-else>
                    <input
                      v-model="searchQuery"
                      type="text"
                      placeholder="Search by name..."
                      class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
                      @input="onSearchInput('team2Player2')"
                      @focus="activeSearchField = 'team2Player2'"
                    />
                    <div v-if="activeSearchField === 'team2Player2' && (searchResults.length > 0 || searchLoading)" class="absolute z-10 mt-1 w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] shadow-lg">
                      <div v-if="searchLoading" class="p-3 text-center text-sm text-[#6B7B75]">Searching...</div>
                      <button
                        v-for="player in searchResults"
                        :key="player.id"
                        type="button"
                        class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#2E4540]"
                        @click="selectPlayer(player)"
                      >
                        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#3A5750] text-sm font-bold text-[#A6ABA7]">
                          {{ player.display_name.charAt(0) }}
                        </div>
                        <div>
                          <p class="text-sm font-medium text-white">{{ player.display_name }}</p>
                          <p v-if="player.city" class="text-xs text-[#6B7B75]">{{ player.city }}</p>
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
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-semibold text-white">Score</h2>
            <button
              v-if="sets.length < 5"
              type="button"
              class="text-sm text-[#4DB175] hover:underline"
              @click="addSet"
            >
              + Add Set
            </button>
          </div>

          <div class="space-y-3">
            <div
              v-for="(set, i) in sets"
              :key="i"
              class="flex items-center gap-3 rounded-lg bg-[#0B0D09] p-3"
            >
              <span class="w-14 text-sm text-[#6B7B75]">Set {{ i + 1 }}</span>
              <div class="flex flex-1 items-center gap-2">
                <input
                  v-model="set.team1Score"
                  type="number"
                  min="0"
                  required
                  placeholder="T1"
                  class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-center text-white focus:border-[#4DB175] focus:outline-none"
                />
                <span class="text-[#6B7B75]">-</span>
                <input
                  v-model="set.team2Score"
                  type="number"
                  min="0"
                  required
                  placeholder="T2"
                  class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-center text-white focus:border-[#4DB175] focus:outline-none"
                />
              </div>
              <button
                v-if="sets.length > 1"
                type="button"
                class="text-[#6B7B75] hover:text-red-400"
                @click="removeSet(i)"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Error -->
        <div v-if="errorMessage" class="rounded-xl bg-red-500/10 p-4 text-red-400">
          {{ errorMessage }}
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <NuxtLink
            to="/dashboard"
            class="flex-1 rounded-xl border border-[#3A5750] py-3 text-center font-medium text-[#A6ABA7] hover:bg-[#2E4540]"
          >
            Cancel
          </NuxtLink>
          <button
            type="submit"
            :disabled="saving || !canSubmit"
            class="flex-1 rounded-xl bg-[#4DB175] py-3 font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
          >
            {{ saving ? 'Submitting...' : 'Submit Match' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
