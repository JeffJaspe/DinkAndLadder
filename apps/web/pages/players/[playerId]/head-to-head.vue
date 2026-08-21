<script setup lang="ts">
interface HeadToHeadMatch {
  match_id: string
  match_type: 'singles' | 'doubles'
  played_at: string
  scores: Array<{ set_number: number; team1_score: number; team2_score: number }>
  result: 'win' | 'loss' | 'draw'
  my_team: number
  opponent_team: number
}

interface HeadToHeadStats {
  opponent: {
    id: string
    display_name: string
  }
  total_matches: number
  wins: number
  losses: number
  draws: number
  matches: HeadToHeadMatch[]
}

const route = useRoute()
const playerId = computed(() => route.params.playerId as string)

const {
  data: statsData,
  pending,
  error
} = await useFetch<{ data: HeadToHeadStats }>(() => `/api/v1/players/me/head-to-head/${playerId.value}`)

const stats = computed(() => statsData.value?.data)

function formatScore(match: HeadToHeadMatch): string {
  return match.scores.map(s => `${s.team1_score}-${s.team2_score}`).join(', ')
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <!-- Back Button -->
      <NuxtLink to="/community" class="inline-flex items-center gap-2 text-sm text-[#6B7B75] hover:text-white">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Community
      </NuxtLink>

      <!-- Loading -->
      <div v-if="pending" class="mt-6 space-y-4">
        <div class="h-32 animate-pulse rounded-xl bg-[#1E2E2A]" />
        <div class="h-48 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="mt-6 rounded-xl bg-[#1E2E2A] p-8 text-center">
        <p class="text-red-400">Could not load head-to-head stats.</p>
        <NuxtLink :to="`/players/${playerId}`" class="mt-4 inline-block text-sm text-[#4DB175] hover:underline">
          View Player Profile
        </NuxtLink>
      </div>

      <!-- Content -->
      <div v-else-if="stats" class="mt-6 space-y-6">
        <!-- Header -->
        <div class="rounded-xl bg-[#1E2E2A] p-6">
          <div class="flex items-center gap-4">
            <div class="flex h-16 w-16 items-center justify-center rounded-full bg-[#2E4540] text-2xl font-bold text-[#A6ABA7]">
              {{ stats.opponent.display_name.charAt(0).toUpperCase() }}
            </div>
            <div>
              <p class="text-sm text-[#6B7B75]">Head-to-Head vs</p>
              <NuxtLink :to="`/players/${stats.opponent.id}`" class="text-xl font-bold text-white hover:text-[#4DB175]">
                {{ stats.opponent.display_name }}
              </NuxtLink>
            </div>
          </div>

          <!-- Record Summary -->
          <div class="mt-6 grid grid-cols-3 gap-4 border-t border-[#3A5750] pt-6">
            <div class="text-center">
              <p class="text-3xl font-bold text-[#4DB175]">{{ stats.wins }}</p>
              <p class="text-xs text-[#6B7B75]">Wins</p>
            </div>
            <div class="text-center">
              <p class="text-3xl font-bold text-[#6B7B75]">{{ stats.draws }}</p>
              <p class="text-xs text-[#6B7B75]">Draws</p>
            </div>
            <div class="text-center">
              <p class="text-3xl font-bold text-red-400">{{ stats.losses }}</p>
              <p class="text-xs text-[#6B7B75]">Losses</p>
            </div>
          </div>
        </div>

        <!-- Match History -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h3 class="mb-4 text-sm font-medium text-[#A6ABA7]">Match History</h3>

          <div v-if="stats.matches.length === 0" class="py-6 text-center text-sm text-[#6B7B75]">
            No matches found.
          </div>

          <div v-else class="space-y-3">
            <NuxtLink
              v-for="match in stats.matches"
              :key="match.match_id"
              :to="`/matches/${match.match_id}`"
              class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3 transition-all hover:bg-[#2E4540]"
            >
              <div>
                <div class="flex items-center gap-2">
                  <span
                    class="rounded-md px-2 py-0.5 text-xs font-medium"
                    :class="{
                      'bg-[#4DB175]/20 text-[#4DB175]': match.result === 'win',
                      'bg-red-500/20 text-red-400': match.result === 'loss',
                      'bg-[#2E4540] text-[#A6ABA7]': match.result === 'draw'
                    }"
                  >
                    {{ match.result === 'win' ? 'Won' : match.result === 'loss' ? 'Lost' : 'Draw' }}
                  </span>
                  <span class="text-xs capitalize text-[#6B7B75]">{{ match.match_type }}</span>
                </div>
                <p class="mt-1 text-sm text-white">{{ formatScore(match) }}</p>
              </div>
              <div class="text-right">
                <p class="text-xs text-[#6B7B75]">{{ formatDate(match.played_at) }}</p>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
