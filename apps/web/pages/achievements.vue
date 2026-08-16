<script setup lang="ts">
interface Achievement {
  id: string
  name: string
  description: string
  category: string
  tier: string
  points: number
  icon_name: string | null
}

interface PlayerAchievement {
  achievement_id: string
  unlocked_at: string
  claimed_at: string | null
  achievement: Achievement
}

const { data: allData } = await useFetch<{ achievements: Achievement[] }>('/api/v1/achievements')
const { data: myData, status } = await useFetch<{ achievements: PlayerAchievement[]; total_points: number }>('/api/v1/players/me/achievements')

const allAchievements = computed(() => allData.value?.achievements ?? [])
const myAchievements = computed(() => myData.value?.achievements ?? [])
const totalPoints = computed(() => myData.value?.total_points ?? 0)

const unlockedIds = computed(() => new Set(myAchievements.value.map(a => a.achievement_id)))

const categories = computed(() => {
  const cats = new Set(allAchievements.value.map(a => a.category))
  return Array.from(cats)
})

const selectedCategory = ref<string | null>(null)

const filteredAchievements = computed(() => {
  if (!selectedCategory.value) return allAchievements.value
  return allAchievements.value.filter(a => a.category === selectedCategory.value)
})

const unlockedCount = computed(() => unlockedIds.value.size)
const totalCount = computed(() => allAchievements.value.length)

function isUnlocked(achievementId: string): boolean {
  return unlockedIds.value.has(achievementId)
}

function getUnlockedAt(achievementId: string): string | null {
  const pa = myAchievements.value.find(a => a.achievement_id === achievementId)
  return pa?.unlocked_at ?? null
}

const tierConfig: Record<string, { bg: string; text: string; label: string }> = {
  bronze: { bg: 'bg-[#CD7F32]', text: 'text-[#CD7F32]', label: 'Bronze' },
  silver: { bg: 'bg-[#C0C0C0]', text: 'text-[#C0C0C0]', label: 'Silver' },
  gold: { bg: 'bg-[#F5A623]', text: 'text-[#F5A623]', label: 'Gold' },
  platinum: { bg: 'bg-[#B5B9F0]', text: 'text-[#B5B9F0]', label: 'Platinum' }
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-5xl">
      <!-- Header -->
      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Achievements</h1>
          <p class="mt-1 text-sm text-[#6B7B75]">Track your progress and earn rewards</p>
        </div>

        <!-- Points Badge -->
        <div class="flex items-center gap-4 rounded-xl bg-[#1E2E2A] p-4">
          <div class="text-center">
            <p class="text-2xl font-bold text-[#F5A623]">{{ totalPoints }}</p>
            <p class="text-xs text-[#6B7B75]">Total Points</p>
          </div>
          <div class="h-10 w-px bg-[#3A5750]" />
          <div class="text-center">
            <p class="text-2xl font-bold text-[#4DB175]">{{ unlockedCount }}/{{ totalCount }}</p>
            <p class="text-xs text-[#6B7B75]">Unlocked</p>
          </div>
        </div>
      </div>

      <!-- Category Filter -->
      <div class="mb-6 flex flex-wrap gap-2">
        <button
          class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="selectedCategory === null
            ? 'bg-[#4DB175] text-white'
            : 'bg-[#1E2E2A] text-[#A6ABA7] hover:text-white'"
          @click="selectedCategory = null"
        >
          All
        </button>
        <button
          v-for="cat in categories"
          :key="cat"
          class="rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors"
          :class="selectedCategory === cat
            ? 'bg-[#4DB175] text-white'
            : 'bg-[#1E2E2A] text-[#A6ABA7] hover:text-white'"
          @click="selectedCategory = cat"
        >
          {{ cat }}
        </button>
      </div>

      <!-- Loading -->
      <div v-if="status === 'pending'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 6" :key="i" class="h-36 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Achievements Grid -->
      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="achievement in filteredAchievements"
          :key="achievement.id"
          class="relative rounded-xl p-4 transition-all"
          :class="isUnlocked(achievement.id)
            ? 'bg-[#1E2E2A] ring-1 ring-[#4DB175]/30'
            : 'bg-[#1E2E2A]/50 opacity-70'"
        >
          <!-- Unlocked Badge -->
          <div
            v-if="isUnlocked(achievement.id)"
            class="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#4DB175] text-white"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div class="flex items-start gap-3">
            <!-- Icon -->
            <div
              class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-xl text-white"
              :class="tierConfig[achievement.tier]?.bg || 'bg-[#3A5750]'"
            >
              {{ achievement.icon_name || achievement.name.charAt(0) }}
            </div>

            <!-- Content -->
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold text-white">{{ achievement.name }}</h3>
              <p class="mt-1 text-sm text-[#6B7B75] line-clamp-2">{{ achievement.description }}</p>

              <div class="mt-3 flex items-center gap-2">
                <span
                  class="rounded-md px-2 py-0.5 text-xs font-medium text-white"
                  :class="tierConfig[achievement.tier]?.bg"
                >
                  {{ tierConfig[achievement.tier]?.label || achievement.tier }}
                </span>
                <span class="text-xs font-medium" :class="tierConfig[achievement.tier]?.text">
                  +{{ achievement.points }} pts
                </span>
              </div>

              <!-- Unlocked Date -->
              <p v-if="getUnlockedAt(achievement.id)" class="mt-2 text-xs text-[#4DB175]">
                Unlocked {{ new Date(getUnlockedAt(achievement.id)!).toLocaleDateString() }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
