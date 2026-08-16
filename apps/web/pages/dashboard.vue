<script setup lang="ts">
import type { UserDto } from '~/server/domains/identity/dto/user.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

const { data: currentUser, pending, error } = await useFetch<UserDto>('/api/v1/auth/me')
const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')
const { data: ratingsData } = await useFetch<{ singles?: { rating_value: number }; doubles?: { rating_value: number } }>('/api/v1/players/me/ratings')

const supabase = useSupabaseClient()

async function handleLogout() {
  await supabase.auth.signOut()
  await navigateTo('/login')
}

const activeRatingType = ref<'singles' | 'doubles'>('singles')
const singlesRating = computed(() => ratingsData.value?.singles?.rating_value ?? 0)
const doublesRating = computed(() => ratingsData.value?.doubles?.rating_value ?? 0)
const displayRating = computed(() => activeRatingType.value === 'singles' ? singlesRating.value : doublesRating.value)

// Rating tiers based on 2.0-8.0 DUPR-style scale
const ratingTier = computed(() => {
  const r = displayRating.value
  if (r >= 6.0) return 'Elite'
  if (r >= 5.5) return 'Pro'
  if (r >= 5.0) return 'Expert'
  if (r >= 4.5) return 'Skilled'
  if (r >= 4.0) return 'Advanced'
  if (r >= 3.5) return 'Intermediate'
  if (r >= 3.0) return 'Novice'
  if (r >= 2.0) return 'Beginner'
  return 'Unrated'
})

const recentActivity = [
  { id: '1', text: 'Kevin Reyes reached a new rating: 4.52', time: '2h ago', icon: '📈' },
  { id: '2', text: 'You won against Mark Cruz 11-8, 11-6', time: '4h ago', icon: '🏆' },
  { id: '3', text: 'Maria Santos joined Cebu Picklers', time: '1d ago', icon: '🏸' }
]

const topPlayers = [
  { rank: 2, name: 'Kevin Reyes', rating: 5.12 },
  { rank: 1, name: 'Miguel Santos', rating: 5.34 },
  { rank: 3, name: 'James Yu', rating: 4.98 }
]
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <!-- Loading State -->
    <div v-if="pending" class="space-y-4">
      <div class="h-24 animate-pulse rounded-xl bg-[#1E2E2A]" />
      <div class="grid grid-cols-2 gap-4">
        <div class="h-32 animate-pulse rounded-xl bg-[#1E2E2A]" />
        <div class="h-32 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center">
      <p class="text-red-400">Could not load your profile. Please try again.</p>
      <button class="mt-4 rounded-lg bg-[#4DB175] px-4 py-2 text-white" @click="$router.go(0)">
        Retry
      </button>
    </div>

    <!-- Content -->
    <div v-else-if="currentUser" class="space-y-5">
      <!-- Header -->
      <div class="flex items-start justify-between">
        <div>
          <p class="text-sm text-[#A6ABA7]">Welcome back,</p>
          <h1 class="text-2xl font-bold text-white">
            {{ myProfile?.display_name || currentUser.email?.split('@')[0] }}! 👋
          </h1>
          <p class="mt-1 text-sm text-[#6B7B75]">Let's climb the ladder today.</p>
        </div>
        <div class="flex gap-2">
          <button class="rounded-lg border border-[#3A5750] px-3 py-1.5 text-xs text-[#A6ABA7] hover:bg-[#2E4540]">
            Share
          </button>
          <button class="rounded-lg border border-[#3A5750] px-3 py-1.5 text-xs text-[#A6ABA7] hover:bg-[#2E4540]">
            Actions
          </button>
        </div>
      </div>

      <!-- Rating & Rank Row -->
      <div class="grid gap-4 sm:grid-cols-2">
        <!-- Rating Card -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-xs font-medium uppercase tracking-wider text-[#6B7B75]">RATING</span>
            <div class="flex gap-1">
              <button
                class="rounded-md px-3 py-1 text-xs font-medium"
                :class="activeRatingType === 'singles' ? 'bg-[#4DB175]/20 text-[#4DB175]' : 'text-[#6B7B75] hover:bg-[#2E4540]'"
                @click="activeRatingType = 'singles'"
              >
                Singles
              </button>
              <button
                class="rounded-md px-3 py-1 text-xs font-medium"
                :class="activeRatingType === 'doubles' ? 'bg-[#4DB175]/20 text-[#4DB175]' : 'text-[#6B7B75] hover:bg-[#2E4540]'"
                @click="activeRatingType = 'doubles'"
              >
                Doubles
              </button>
            </div>
          </div>
          <div class="flex items-baseline gap-3">
            <span class="text-5xl font-bold text-white">
              {{ displayRating > 0 ? displayRating.toFixed(2) : '—' }}
            </span>
            <span class="text-lg text-[#4DB175]">{{ ratingTier }}</span>
          </div>
        </div>

        <!-- Rank Card -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <div class="mb-3">
            <span class="text-xs font-medium uppercase tracking-wider text-[#6B7B75]">RANK</span>
          </div>
          <div class="flex items-baseline gap-3">
            <span class="text-5xl font-bold text-white">#12</span>
            <div>
              <p class="text-sm text-[#A6ABA7]">Cebu City</p>
              <p class="text-xs text-[#4DB175]">Top 2%</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Podium & Chart Row -->
      <div class="grid gap-4 sm:grid-cols-2">
        <!-- Podium -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <div class="flex items-end justify-center gap-3 pt-6">
            <!-- 2nd Place -->
            <div class="flex flex-col items-center">
              <div class="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-[#2E4540] text-sm font-bold text-[#C0C0C0] ring-2 ring-[#C0C0C0]">
                K
              </div>
              <p class="text-xs text-[#A6ABA7]">Kevin</p>
              <p class="text-xs text-[#6B7B75]">5.12</p>
              <div class="mt-2 flex h-16 w-14 items-end justify-center rounded-t-lg bg-[#C0C0C0]/20">
                <span class="mb-2 text-xl font-bold text-[#C0C0C0]">2</span>
              </div>
            </div>

            <!-- 1st Place -->
            <div class="flex flex-col items-center">
              <div class="relative mb-2">
                <div class="flex h-14 w-14 items-center justify-center rounded-full bg-[#2E4540] text-lg font-bold text-[#F5A623] ring-2 ring-[#F5A623]">
                  M
                </div>
                <span class="absolute -top-4 left-1/2 -translate-x-1/2 text-lg">👑</span>
              </div>
              <p class="text-xs text-[#A6ABA7]">Miguel</p>
              <p class="text-xs text-[#6B7B75]">5.34</p>
              <div class="mt-2 flex h-24 w-14 items-end justify-center rounded-t-lg bg-[#F5A623]/20">
                <span class="mb-2 text-xl font-bold text-[#F5A623]">1</span>
              </div>
            </div>

            <!-- 3rd Place -->
            <div class="flex flex-col items-center">
              <div class="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#2E4540] text-sm font-bold text-[#CD7F32] ring-2 ring-[#CD7F32]">
                J
              </div>
              <p class="text-xs text-[#A6ABA7]">James</p>
              <p class="text-xs text-[#6B7B75]">4.98</p>
              <div class="mt-2 flex h-12 w-14 items-end justify-center rounded-t-lg bg-[#CD7F32]/20">
                <span class="mb-2 text-xl font-bold text-[#CD7F32]">3</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Rating Progress Chart -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <div class="mb-4 flex items-center justify-between">
            <span class="text-sm text-[#A6ABA7]">Rating Progress</span>
            <div class="flex gap-1">
              <button class="rounded px-2 py-0.5 text-xs text-[#6B7B75] hover:bg-[#2E4540]">1D</button>
              <button class="rounded px-2 py-0.5 text-xs text-[#6B7B75] hover:bg-[#2E4540]">7D</button>
              <button class="rounded bg-[#4DB175]/20 px-2 py-0.5 text-xs text-[#4DB175]">1M</button>
              <button class="rounded px-2 py-0.5 text-xs text-[#6B7B75] hover:bg-[#2E4540]">ALL</button>
            </div>
          </div>
          <div class="flex h-28 items-end gap-1">
            <div class="h-[45%] flex-1 rounded-t bg-[#4DB175]/40" />
            <div class="h-[55%] flex-1 rounded-t bg-[#4DB175]/40" />
            <div class="h-[50%] flex-1 rounded-t bg-[#4DB175]/40" />
            <div class="h-[65%] flex-1 rounded-t bg-[#4DB175]/40" />
            <div class="h-[60%] flex-1 rounded-t bg-[#4DB175]/40" />
            <div class="h-[70%] flex-1 rounded-t bg-[#4DB175]/40" />
            <div class="h-[75%] flex-1 rounded-t bg-[#4DB175]/40" />
            <div class="h-[68%] flex-1 rounded-t bg-[#4DB175]/40" />
            <div class="h-[80%] flex-1 rounded-t bg-[#4DB175]/40" />
            <div class="h-[85%] flex-1 rounded-t bg-[#4DB175]/40" />
            <div class="h-[78%] flex-1 rounded-t bg-[#4DB175]/40" />
            <div class="h-[90%] flex-1 rounded-t bg-[#4DB175]/40" />
          </div>
          <div class="mt-2 flex justify-between text-xs text-[#6B7B75]">
            <span>May 1</span>
            <span>May 15</span>
            <span>Jun 1</span>
          </div>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="rounded-xl bg-[#1E2E2A] p-5">
        <div class="mb-4 flex items-center justify-between">
          <span class="text-sm font-medium text-[#A6ABA7]">Recent Activity</span>
          <NuxtLink to="/feed" class="text-xs text-[#4DB175] hover:underline">View all (3)</NuxtLink>
        </div>
        <div class="space-y-2">
          <div
            v-for="activity in recentActivity"
            :key="activity.id"
            class="flex items-center gap-3 rounded-lg bg-[#2E4540]/50 p-3"
          >
            <span class="text-base">{{ activity.icon }}</span>
            <span class="flex-1 text-sm text-[#A6ABA7]">{{ activity.text }}</span>
            <span class="text-xs text-[#6B7B75]">{{ activity.time }}</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NuxtLink
          to="/my-clubs"
          class="flex items-center gap-3 rounded-xl bg-[#4DB175] p-4 text-white transition-colors hover:bg-[#5FC287]"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span class="text-sm font-medium">My Clubs</span>
        </NuxtLink>

        <NuxtLink
          to="/rankings"
          class="flex items-center gap-3 rounded-xl bg-[#1E2E2A] p-4 transition-colors hover:bg-[#2E4540]"
        >
          <svg class="h-5 w-5 text-[#6B7B75]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span class="text-sm font-medium text-[#A6ABA7]">Rankings</span>
        </NuxtLink>

        <NuxtLink
          to="/events"
          class="flex items-center gap-3 rounded-xl bg-[#1E2E2A] p-4 transition-colors hover:bg-[#2E4540]"
        >
          <svg class="h-5 w-5 text-[#6B7B75]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span class="text-sm font-medium text-[#A6ABA7]">Events</span>
        </NuxtLink>

        <NuxtLink
          to="/players"
          class="flex items-center gap-3 rounded-xl bg-[#1E2E2A] p-4 transition-colors hover:bg-[#2E4540]"
        >
          <svg class="h-5 w-5 text-[#6B7B75]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span class="text-sm font-medium text-[#A6ABA7]">Find Players</span>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
