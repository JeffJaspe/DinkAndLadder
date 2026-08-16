<script setup lang="ts">
interface Activity {
  id: string
  activity_type: string
  actor_player_id: string
  actor_display_name: string
  payload: Record<string, unknown>
  created_at: string
}

const { data, status, error, refresh } = await useFetch<{ activities: Activity[] }>('/api/v1/feed')

const activities = computed(() => data.value?.activities ?? [])

function getActivityIcon(type: string): string {
  switch (type) {
    case 'match.verified': return '🎯'
    case 'rating.changed': return '📈'
    case 'social.started_following': return '👤'
    case 'achievement.unlocked': return '🏆'
    case 'club.joined': return '🏸'
    case 'tournament.registered': return '🎪'
    default: return '📌'
  }
}

function formatActivityText(activity: Activity): string {
  const payload = activity.payload as Record<string, string>
  switch (activity.activity_type) {
    case 'match.verified':
      return `played a match (${payload.match_type})`
    case 'rating.changed':
      return `rating updated to ${payload.new_rating} (${payload.rating_type})`
    case 'social.started_following':
      return `started following ${payload.target_display_name}`
    case 'achievement.unlocked':
      return `unlocked achievement: ${payload.achievement_name}`
    case 'club.joined':
      return `joined club ${payload.club_name}`
    case 'tournament.registered':
      return `registered for ${payload.tournament_name}`
    default:
      return activity.activity_type.replace('.', ' ')
  }
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <!-- Header -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Activity Feed</h1>
          <p class="mt-1 text-sm text-[#6B7B75]">See what your community is up to</p>
        </div>
        <button
          class="rounded-lg p-2 text-[#6B7B75] hover:bg-[#1E2E2A] hover:text-white"
          @click="refresh()"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="status === 'pending'" class="space-y-3">
        <div v-for="i in 5" :key="i" class="h-20 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">Failed to load feed.</p>
        <button class="mt-2 text-sm text-[#4DB175] hover:underline" @click="refresh()">
          Try again
        </button>
      </div>

      <!-- Empty -->
      <div v-else-if="activities.length === 0" class="rounded-xl bg-[#1E2E2A] p-12 text-center">
        <p class="text-4xl">📰</p>
        <h3 class="mt-4 text-lg font-semibold text-white">No activity yet</h3>
        <p class="mt-2 text-sm text-[#6B7B75]">Follow other players to see their activity here</p>
        <NuxtLink to="/players" class="mt-4 inline-block rounded-lg bg-[#4DB175] px-4 py-2 text-white">
          Find Players
        </NuxtLink>
      </div>

      <!-- Activity List -->
      <div v-else class="space-y-3">
        <div
          v-for="activity in activities"
          :key="activity.id"
          class="flex gap-4 rounded-xl bg-[#1E2E2A] p-4"
        >
          <!-- Icon -->
          <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#2E4540] text-xl">
            {{ getActivityIcon(activity.activity_type) }}
          </div>

          <!-- Content -->
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <p>
                <NuxtLink
                  :to="`/players/${activity.actor_player_id}`"
                  class="font-medium text-[#4DB175] hover:underline"
                >
                  {{ activity.actor_display_name }}
                </NuxtLink>
                <span class="text-[#A6ABA7]">
                  {{ formatActivityText(activity) }}
                </span>
              </p>
              <span class="flex-shrink-0 text-xs text-[#6B7B75]">
                {{ formatTime(activity.created_at) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Find More -->
      <div v-if="activities.length > 0" class="mt-8 text-center">
        <NuxtLink to="/players" class="text-sm text-[#4DB175] hover:underline">
          Find more players to follow
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
