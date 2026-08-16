<script setup lang="ts">
import type { RankingEntryDto } from '~/server/domains/rating/dto/ranking.dto'

const ratingType = ref<'singles' | 'doubles'>('singles')
const province = ref('')
const searchQuery = ref('')

const {
  data: response,
  pending,
  error
} = await useFetch<{ data: RankingEntryDto[] }>('/api/v1/rankings', {
  query: { rating_type: ratingType, province },
  watch: [ratingType, province]
})

const filteredRankings = computed(() => {
  if (!response.value?.data) return []
  if (!searchQuery.value) return response.value.data
  const q = searchQuery.value.toLowerCase()
  return response.value.data.filter(e => e.display_name.toLowerCase().includes(q))
})

const topThree = computed(() => filteredRankings.value.slice(0, 3))
const restOfRankings = computed(() => filteredRankings.value.slice(3))
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-white">Rankings</h1>
      <p class="mt-1 text-sm text-[#6B7B75]">The official rankings of pickleball players in the Philippines.</p>
    </div>

    <!-- Filters Row -->
    <div class="mb-6 flex flex-wrap items-center gap-3">
      <!-- Rating Type Toggle -->
      <div class="flex rounded-lg bg-[#1E2E2A] p-1">
        <button
          v-for="type in ['singles', 'doubles'] as const"
          :key="type"
          type="button"
          class="rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors"
          :class="type === ratingType
            ? 'bg-[#4DB175] text-white'
            : 'text-[#6B7B75] hover:text-white'"
          @click="ratingType = type"
        >
          {{ type }}
        </button>
      </div>

      <!-- Province Filter -->
      <select
        v-model="province"
        class="rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-4 py-2 text-sm text-white focus:border-[#4DB175] focus:outline-none"
      >
        <option value="">All Regions</option>
        <option value="Metro Manila">Metro Manila</option>
        <option value="Cebu">Cebu</option>
        <option value="Davao">Davao</option>
      </select>

      <!-- Search -->
      <div class="relative flex-1 lg:max-w-xs">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search players..."
          class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] py-2 pl-10 pr-4 text-sm text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
        />
        <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7B75]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="space-y-4">
      <div class="flex justify-center gap-4 py-8">
        <div v-for="i in 3" :key="i" class="h-44 w-28 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>
      <div class="h-64 animate-pulse rounded-xl bg-[#1E2E2A]" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center">
      <p class="text-red-400">Could not load rankings. Please try again.</p>
      <button class="mt-4 rounded-lg bg-[#4DB175] px-4 py-2 text-white" @click="$router.go(0)">
        Retry
      </button>
    </div>

    <!-- Empty -->
    <div v-else-if="!filteredRankings.length" class="rounded-xl bg-[#1E2E2A] p-12 text-center">
      <p class="text-4xl">🏆</p>
      <h3 class="mt-4 text-lg font-semibold text-white">
        {{ searchQuery ? 'No players found' : 'No ranked players yet' }}
      </h3>
      <p class="mt-2 text-sm text-[#6B7B75]">
        {{ searchQuery ? `No players match '${searchQuery}'` : `Be the first to get ranked in ${ratingType}!` }}
      </p>
      <NuxtLink to="/matches/submit" class="mt-4 inline-block rounded-lg bg-[#4DB175] px-4 py-2 text-white">
        Submit a Match
      </NuxtLink>
    </div>

    <!-- Rankings Content -->
    <div v-else class="space-y-6">
      <!-- Podium (Top 3) -->
      <div v-if="topThree.length >= 3" class="rounded-xl bg-[#1E2E2A] p-6">
        <div class="flex items-end justify-center gap-4">
          <!-- 2nd Place -->
          <NuxtLink
            :to="`/players/${topThree[1].player_id}`"
            class="flex flex-col items-center transition-transform hover:scale-105"
          >
            <div class="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#2E4540] text-lg font-bold text-[#C0C0C0] ring-2 ring-[#C0C0C0]">
              {{ topThree[1].display_name.charAt(0) }}
            </div>
            <p class="text-xs text-[#A6ABA7]">{{ topThree[1].display_name.split(' ')[0] }}</p>
            <p class="text-xs text-[#6B7B75]">{{ Math.round(topThree[1].rating_value) }}</p>
            <div class="mt-2 flex h-16 w-14 items-end justify-center rounded-t-lg bg-[#C0C0C0]/20">
              <span class="mb-2 text-xl font-bold text-[#C0C0C0]">2</span>
            </div>
          </NuxtLink>

          <!-- 1st Place -->
          <NuxtLink
            :to="`/players/${topThree[0].player_id}`"
            class="flex flex-col items-center transition-transform hover:scale-105"
          >
            <div class="relative mb-2">
              <span class="absolute -top-4 left-1/2 -translate-x-1/2 text-lg">👑</span>
              <div class="flex h-14 w-14 items-center justify-center rounded-full bg-[#2E4540] text-xl font-bold text-[#F5A623] ring-2 ring-[#F5A623]">
                {{ topThree[0].display_name.charAt(0) }}
              </div>
            </div>
            <p class="text-sm text-[#A6ABA7]">{{ topThree[0].display_name.split(' ')[0] }}</p>
            <p class="text-xs text-[#6B7B75]">{{ Math.round(topThree[0].rating_value) }}</p>
            <div class="mt-2 flex h-24 w-16 items-end justify-center rounded-t-lg bg-[#F5A623]/20">
              <span class="mb-2 text-2xl font-bold text-[#F5A623]">1</span>
            </div>
          </NuxtLink>

          <!-- 3rd Place -->
          <NuxtLink
            :to="`/players/${topThree[2].player_id}`"
            class="flex flex-col items-center transition-transform hover:scale-105"
          >
            <div class="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#2E4540] text-sm font-bold text-[#CD7F32] ring-2 ring-[#CD7F32]">
              {{ topThree[2].display_name.charAt(0) }}
            </div>
            <p class="text-xs text-[#A6ABA7]">{{ topThree[2].display_name.split(' ')[0] }}</p>
            <p class="text-xs text-[#6B7B75]">{{ Math.round(topThree[2].rating_value) }}</p>
            <div class="mt-2 flex h-12 w-14 items-end justify-center rounded-t-lg bg-[#CD7F32]/20">
              <span class="mb-2 text-xl font-bold text-[#CD7F32]">3</span>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- Rankings Table -->
      <div class="overflow-x-auto rounded-xl bg-[#1E2E2A]">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b border-[#3A5750]">
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#6B7B75]">#</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#6B7B75]">Player</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#6B7B75]">Location</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#6B7B75]">Rating</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#6B7B75]">Trend</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in (topThree.length >= 3 ? restOfRankings : filteredRankings)"
              :key="entry.player_id"
              class="border-b border-[#3A5750]/50 transition-colors hover:bg-[#2E4540]/30"
            >
              <td class="px-4 py-3">
                <span class="text-sm text-[#6B7B75]">{{ entry.rank }}</span>
              </td>
              <td class="px-4 py-3">
                <NuxtLink
                  :to="`/players/${entry.player_id}`"
                  class="text-sm font-medium text-white hover:text-[#4DB175]"
                >
                  {{ entry.display_name }}
                </NuxtLink>
              </td>
              <td class="px-4 py-3 text-sm text-[#6B7B75]">
                {{ entry.city || 'Unknown' }}
              </td>
              <td class="px-4 py-3">
                <span class="text-sm font-semibold text-[#4DB175]">{{ Math.round(entry.rating_value) }}</span>
              </td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center gap-1 text-sm text-[#4DB175]">
                  <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                  </svg>
                  {{ Math.floor(Math.random() * 20) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination -->
        <div class="flex items-center justify-center gap-2 border-t border-[#3A5750] px-4 py-3">
          <button class="rounded-md px-3 py-1 text-sm text-[#6B7B75] hover:bg-[#2E4540]">&lt;</button>
          <button class="rounded-md bg-[#4DB175] px-3 py-1 text-sm text-white">1</button>
          <button class="rounded-md px-3 py-1 text-sm text-[#6B7B75] hover:bg-[#2E4540]">2</button>
          <button class="rounded-md px-3 py-1 text-sm text-[#6B7B75] hover:bg-[#2E4540]">3</button>
          <span class="text-[#6B7B75]">...</span>
          <button class="rounded-md px-3 py-1 text-sm text-[#6B7B75] hover:bg-[#2E4540]">25</button>
          <button class="rounded-md px-3 py-1 text-sm text-[#6B7B75] hover:bg-[#2E4540]">&gt;</button>
        </div>
      </div>
    </div>
  </div>
</template>
