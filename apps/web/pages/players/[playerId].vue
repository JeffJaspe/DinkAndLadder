<script setup lang="ts">
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { PlayerRatingDto } from '~/server/domains/rating/dto/rating.dto'

interface Achievement {
  id: string
  name: string
  tier: string
  points: number
}

interface PlayerAchievement {
  achievement_id: string
  unlocked_at: string
  achievement: Achievement
}

const route = useRoute()
const user = useSupabaseUser()
const playerId = computed(() => route.params.playerId as string)

const {
  data: profile,
  pending,
  error
} = await useFetch<PlayerProfileDto>(() => `/api/v1/players/${playerId.value}`)

const { data: ratings } = await useFetch<{
  singles: PlayerRatingDto | null
  doubles: PlayerRatingDto | null
}>(() => `/api/v1/players/${playerId.value}/ratings`)

const { data: achievementsData } = await useFetch<{ achievements: PlayerAchievement[] }>(
  () => `/api/v1/players/${playerId.value}/achievements`
)

const { data: myProfile } = await useFetch<PlayerProfileDto | null>('/api/v1/players/me', {
  server: false
})

const isOwnProfile = computed(() => myProfile.value?.id === playerId.value)

const { data: followingData, refresh: refreshFollowing } = await useFetch<{ following: { player_id: string }[] }>(
  '/api/v1/players/me/following',
  { server: false }
)

const isFollowing = computed(() => {
  if (!followingData.value?.following) return false
  return followingData.value.following.some(f => f.player_id === playerId.value)
})

const followLoading = ref(false)
const activeTab = ref<'overview' | 'matches' | 'stats' | 'achievements' | 'activity'>('overview')

async function toggleFollow() {
  if (!user.value) return
  followLoading.value = true
  try {
    if (isFollowing.value) {
      await $fetch(`/api/v1/players/${playerId.value}/follow`, { method: 'DELETE' })
    } else {
      await $fetch(`/api/v1/players/${playerId.value}/follow`, { method: 'POST' })
    }
    await refreshFollowing()
  } finally {
    followLoading.value = false
  }
}

const achievements = computed(() => achievementsData.value?.achievements?.slice(0, 6) ?? [])
const displayRating = computed(() => Math.max(ratings.value?.singles?.rating_value ?? 0, ratings.value?.doubles?.rating_value ?? 0))

const recentMatches = [
  { id: '1', opponent: 'Mark Cruz', score: '21-18, 21-16', result: 'Won', time: '2h ago' },
  { id: '2', opponent: 'Carl Villanueva', score: '18-21, 21-17, 15-12', result: 'Won', time: '1d ago' },
  { id: '3', opponent: 'James Yu', score: '18-21, 21-21', result: 'Lost', time: '3d ago' }
]
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <!-- Loading -->
    <div v-if="pending" class="mx-auto max-w-3xl space-y-4">
      <div class="flex items-start gap-4">
        <div class="h-20 w-20 animate-pulse rounded-full bg-[#1E2E2A]" />
        <div class="flex-1 space-y-2">
          <div class="h-6 w-48 animate-pulse rounded bg-[#1E2E2A]" />
          <div class="h-4 w-32 animate-pulse rounded bg-[#1E2E2A]" />
        </div>
      </div>
      <div class="h-48 animate-pulse rounded-xl bg-[#1E2E2A]" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="mx-auto max-w-3xl rounded-xl bg-[#1E2E2A] p-8 text-center">
      <p class="text-4xl">🔒</p>
      <h2 class="mt-4 text-xl font-semibold text-white">
        {{ error.statusCode === 404 ? 'Profile Not Found' : 'Error Loading Profile' }}
      </h2>
      <p class="mt-2 text-sm text-[#6B7B75]">
        {{ error.statusCode === 404 ? 'This profile is private or does not exist.' : 'Please try again later.' }}
      </p>
      <NuxtLink to="/players" class="mt-4 inline-block rounded-lg bg-[#4DB175] px-4 py-2 text-white">
        Browse Players
      </NuxtLink>
    </div>

    <!-- Profile -->
    <div v-else-if="profile" class="mx-auto max-w-3xl space-y-6">
      <!-- Back Button -->
      <NuxtLink to="/players" class="inline-flex items-center gap-2 text-sm text-[#6B7B75] hover:text-white">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </NuxtLink>

      <!-- Header Card -->
      <div class="rounded-xl bg-[#1E2E2A] p-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <!-- Avatar & Info -->
          <div class="flex items-start gap-4">
            <div class="relative">
              <div class="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-[#2E4540] text-3xl font-bold text-white ring-4 ring-[#4DB175]">
                {{ profile.display_name?.charAt(0).toUpperCase() }}
              </div>
            </div>
            <div>
              <h1 class="text-2xl font-bold text-white">{{ profile.display_name }}</h1>
              <p v-if="profile.city || profile.province" class="mt-1 text-sm text-[#6B7B75]">
                {{ [profile.city, profile.province].filter(Boolean).join(', ') }}
              </p>
              <p v-if="profile.bio" class="mt-2 text-sm text-[#A6ABA7]">{{ profile.bio }}</p>
            </div>
          </div>

          <!-- Rating & Action -->
          <div class="flex flex-col items-end gap-2">
            <div class="text-right">
              <p class="text-xs uppercase text-[#6B7B75]">RATING</p>
              <p class="text-3xl font-bold text-[#4DB175]">{{ displayRating > 0 ? displayRating.toFixed(2) : '—' }}</p>
            </div>
            <button
              v-if="user && !isOwnProfile"
              class="rounded-lg px-5 py-2 text-sm font-medium transition-colors"
              :class="isFollowing
                ? 'border border-[#3A5750] text-white hover:border-red-400 hover:text-red-400'
                : 'bg-[#4DB175] text-white hover:bg-[#5FC287]'"
              :disabled="followLoading"
              @click="toggleFollow"
            >
              {{ followLoading ? '...' : isFollowing ? 'Following' : 'Follow' }}
            </button>
          </div>
        </div>

        <!-- Stats Row -->
        <div class="mt-6 grid grid-cols-4 gap-4 border-t border-[#3A5750] pt-4">
          <div class="text-center">
            <p class="text-xl font-bold text-white">124</p>
            <p class="text-xs text-[#6B7B75]">Matches</p>
          </div>
          <div class="text-center">
            <p class="text-xl font-bold text-white">68%</p>
            <p class="text-xs text-[#6B7B75]">Win Rate</p>
          </div>
          <div class="text-center">
            <p class="text-xl font-bold text-white">84-40</p>
            <p class="text-xs text-[#6B7B75]">W - L</p>
          </div>
          <div class="text-center">
            <p class="text-xl font-bold text-white">8</p>
            <p class="text-xs text-[#6B7B75]">Titles</p>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 rounded-xl bg-[#1E2E2A] p-1">
        <button
          v-for="tab in ['overview', 'matches', 'stats', 'achievements', 'activity'] as const"
          :key="tab"
          class="flex-1 rounded-lg py-2 text-xs font-medium capitalize transition-colors"
          :class="activeTab === tab
            ? 'bg-[#4DB175] text-white'
            : 'text-[#6B7B75] hover:text-white'"
          @click="activeTab = tab"
        >
          {{ tab }}
        </button>
      </div>

      <!-- Tab Content -->
      <div class="space-y-4">
        <!-- Overview Tab -->
        <template v-if="activeTab === 'overview'">
          <!-- Rating History -->
          <div class="rounded-xl bg-[#1E2E2A] p-5">
            <div class="mb-4 flex items-center justify-between">
              <span class="text-sm font-medium text-white">Rating History</span>
              <div class="flex gap-1 text-xs">
                <button class="rounded px-2 py-0.5 text-[#6B7B75] hover:bg-[#2E4540]">1W</button>
                <button class="rounded px-2 py-0.5 text-[#6B7B75] hover:bg-[#2E4540]">3M</button>
                <button class="rounded bg-[#4DB175]/20 px-2 py-0.5 text-[#4DB175]">6M</button>
                <button class="rounded px-2 py-0.5 text-[#6B7B75] hover:bg-[#2E4540]">1Y</button>
              </div>
            </div>
            <div class="flex h-32 items-end gap-1">
              <div v-for="i in 12" :key="i" class="flex-1 rounded-t bg-[#4DB175]/30" :style="{ height: `${40 + Math.random() * 60}%` }" />
            </div>
            <div class="mt-2 flex justify-between text-xs text-[#6B7B75]">
              <span>May 1</span>
              <span>Jun 1</span>
              <span>Jan 30</span>
            </div>
          </div>

          <!-- Favorite Shot & Playing Style -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="rounded-xl bg-[#1E2E2A] p-4">
              <p class="text-xs text-[#6B7B75]">Favorite Shot</p>
              <p class="mt-1 font-medium text-white">Dink</p>
            </div>
            <div class="rounded-xl bg-[#1E2E2A] p-4">
              <p class="text-xs text-[#6B7B75]">Playing Style</p>
              <p class="mt-1 font-medium text-white">Defensive Baseline</p>
            </div>
          </div>
        </template>

        <!-- Matches Tab -->
        <template v-if="activeTab === 'matches'">
          <div class="rounded-xl bg-[#1E2E2A] p-5">
            <h3 class="mb-4 text-sm font-medium text-white">Recent Matches</h3>
            <div class="space-y-3">
              <NuxtLink
                v-for="match in recentMatches"
                :key="match.id"
                :to="`/matches/${match.id}`"
                class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3 transition-all hover:bg-[#2E4540]"
              >
                <div>
                  <p class="text-sm text-white">vs {{ match.opponent }}</p>
                  <p class="text-xs text-[#6B7B75]">{{ match.score }}</p>
                </div>
                <div class="text-right">
                  <span
                    class="rounded-md px-2 py-0.5 text-xs font-medium"
                    :class="match.result === 'Won' ? 'bg-[#4DB175]/20 text-[#4DB175]' : 'bg-red-500/20 text-red-400'"
                  >
                    {{ match.result }}
                  </span>
                  <p class="mt-1 text-xs text-[#6B7B75]">{{ match.time }}</p>
                </div>
              </NuxtLink>
            </div>
          </div>
        </template>

        <!-- Stats Tab -->
        <template v-if="activeTab === 'stats'">
          <div class="rounded-xl bg-[#1E2E2A] p-5">
            <h3 class="mb-4 text-sm font-medium text-white">Performance Stats</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-lg bg-[#0B0D09] p-3">
                <p class="text-xs text-[#6B7B75]">Win Streak</p>
                <p class="text-xl font-bold text-[#4DB175]">5</p>
              </div>
              <div class="rounded-lg bg-[#0B0D09] p-3">
                <p class="text-xs text-[#6B7B75]">Points Per Game</p>
                <p class="text-xl font-bold text-white">18.2</p>
              </div>
              <div class="rounded-lg bg-[#0B0D09] p-3">
                <p class="text-xs text-[#6B7B75]">Skill Level</p>
                <p class="text-xl font-bold text-white">4.0 - 4.5</p>
              </div>
              <div class="rounded-lg bg-[#0B0D09] p-3">
                <p class="text-xs text-[#6B7B75]">Ranking</p>
                <p class="text-xl font-bold text-[#F5A623]">#12</p>
              </div>
            </div>
          </div>
        </template>

        <!-- Achievements Tab -->
        <template v-if="activeTab === 'achievements'">
          <div class="rounded-xl bg-[#1E2E2A] p-5">
            <h3 class="mb-4 text-sm font-medium text-white">Achievements</h3>
            <div v-if="achievements.length > 0" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div
                v-for="pa in achievements"
                :key="pa.achievement_id"
                class="rounded-lg bg-[#0B0D09] p-3 text-center"
              >
                <div class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#F5A623]/20 text-[#F5A623]">
                  🏆
                </div>
                <p class="text-xs font-medium text-white">{{ pa.achievement.name }}</p>
                <p class="text-xs text-[#6B7B75]">+{{ pa.achievement.points }} pts</p>
              </div>
            </div>
            <p v-else class="text-center text-[#6B7B75]">No achievements yet</p>
          </div>
        </template>

        <!-- Activity Tab -->
        <template v-if="activeTab === 'activity'">
          <div class="rounded-xl bg-[#1E2E2A] p-5">
            <h3 class="mb-4 text-sm font-medium text-white">Recent Activity</h3>
            <div class="space-y-3">
              <div class="flex items-center gap-3 rounded-lg bg-[#0B0D09] p-3">
                <span class="text-lg">🏆</span>
                <div>
                  <p class="text-sm text-white">Won match vs Mark Cruz</p>
                  <p class="text-xs text-[#6B7B75]">2 hours ago</p>
                </div>
              </div>
              <div class="flex items-center gap-3 rounded-lg bg-[#0B0D09] p-3">
                <span class="text-lg">📈</span>
                <div>
                  <p class="text-sm text-white">Rating increased to 4.85</p>
                  <p class="text-xs text-[#6B7B75]">2 hours ago</p>
                </div>
              </div>
              <div class="flex items-center gap-3 rounded-lg bg-[#0B0D09] p-3">
                <span class="text-lg">🏸</span>
                <div>
                  <p class="text-sm text-white">Joined Cebu Picklers</p>
                  <p class="text-xs text-[#6B7B75]">1 week ago</p>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
