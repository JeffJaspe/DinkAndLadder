<script setup lang="ts">
import type { EventDto } from '~/server/domains/event/dto/event.dto'

useHead({ title: 'Feed' })

interface Activity {
  id: string
  activity_type: string
  actor_player_id: string | null
  actor_display_name?: string
  metadata: Record<string, unknown> | null
  created_at: string
}

const { data, status, error, refresh } = await useFetch<{ activities: Activity[] }>('/api/v1/feed')

const activities = computed(() => data.value?.activities ?? [])

/**
 * The feed is a log of things that already happened, so an event published a
 * month ago but starting next week sinks out of sight — "coming soon" was
 * effectively invisible. This strip reads the events list directly rather than
 * inventing synthetic activity rows for something that has not occurred yet.
 */
const { data: eventsData } = await useFetch<{ events: EventDto[] }>('/api/v1/events', {
  query: { limit: 20 },
  default: () => ({ events: [] as EventDto[] })
})

const upcomingEvents = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return (eventsData.value?.events ?? [])
    .filter((e) => e.status === 'published' && e.start_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 5)
})

function formatEventDate(startDate: string): string {
  return new Date(startDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

function getActivityIcon(type: string): string {
  switch (type) {
    case 'match.verified':
      return '🎯'
    case 'rating.changed':
      return '📈'
    case 'social.started_following':
      return '👤'
    case 'social.shoutout':
      return '📣'
    case 'achievement.unlocked':
      return '🏆'
    case 'club.joined':
      return '🏸'
    case 'tournament.registered':
      return '🎪'
    default:
      return '📌'
  }
}

function formatActivityText(activity: Activity): string {
  const meta = (activity.metadata ?? {}) as Record<string, string>
  switch (activity.activity_type) {
    case 'match.verified':
      return `played a match (${meta.match_type ?? 'singles'})`
    case 'rating.changed':
      return `rating updated to ${meta.new_rating ?? '?'} (${meta.rating_type ?? 'singles'})`
    case 'social.started_following':
      return `started following ${meta.target_display_name ?? 'someone'}`
    case 'social.shoutout':
      return meta.message ? `shouts: "${meta.message}"` : 'posted a shout-out'
    case 'achievement.unlocked':
      return `unlocked achievement: ${meta.achievement_name ?? 'New Achievement'}`
    case 'club.joined':
      return `joined club ${meta.club_name ?? ''}`
    case 'tournament.registered':
      return `registered for ${meta.tournament_name ?? 'a tournament'}`
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
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <!-- Header -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-fg">Activity Feed</h1>
          <p class="mt-1 text-sm text-fg-muted">See what your community is up to</p>
        </div>
        <button
          class="rounded-lg p-2 text-fg-muted hover:bg-surface hover:text-fg"
          @click="refresh()"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      <!--
        Sits above the activity log deliberately: the feed is a record of the
        past, and an event that has not happened yet would otherwise never
        surface here at all.
      -->
      <section v-if="upcomingEvents.length" class="mb-8">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">Coming up</h2>
        <div class="scroll-x">
          <div class="flex gap-3 pb-2">
            <NuxtLink
              v-for="upcoming in upcomingEvents"
              :key="upcoming.id"
              :to="`/events/${upcoming.id}`"
              class="min-w-[14rem] flex-1 rounded-xl bg-surface p-4 transition-colors hover:bg-surface-2 shadow-card hover:shadow-card-hover"
            >
              <p class="text-xs font-medium text-primary">
                {{ formatEventDate(upcoming.start_date) }}
              </p>
              <p class="mt-1 truncate font-medium text-fg">{{ upcoming.name }}</p>
              <p
                v-if="upcoming.venue || upcoming.city"
                class="mt-0.5 truncate text-xs text-fg-muted"
              >
                {{ [upcoming.venue, upcoming.city].filter(Boolean).join(', ') }}
              </p>
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- Loading -->
      <div v-if="status === 'pending'" class="space-y-3">
        <div v-for="i in 5" :key="i" class="h-20 animate-pulse rounded-xl bg-surface" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">Failed to load feed.</p>
        <button class="mt-2 text-sm text-primary hover:underline" @click="refresh()">
          Try again
        </button>
      </div>

      <!-- Empty -->
      <div
        v-else-if="activities.length === 0"
        class="rounded-xl bg-surface p-12 text-center shadow-card"
      >
        <p class="text-4xl">📰</p>
        <h3 class="mt-4 text-lg font-semibold text-fg">No activity yet</h3>
        <p class="mt-2 text-sm text-fg-muted">Follow other players to see their activity here</p>
        <NuxtLink
          to="/players"
          class="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-on-primary"
        >
          Find Players
        </NuxtLink>
      </div>

      <!-- Activity List -->
      <div v-else class="space-y-3">
        <div
          v-for="activity in activities"
          :key="activity.id"
          class="flex gap-4 rounded-xl bg-surface p-4 shadow-card"
        >
          <!-- Icon -->
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-xl"
          >
            {{ getActivityIcon(activity.activity_type) }}
          </div>

          <!-- Content -->
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <p>
                <NuxtLink
                  :to="`/players/${activity.actor_player_id}`"
                  class="font-medium text-primary hover:underline"
                >
                  {{ activity.actor_display_name }}
                </NuxtLink>
                {{ ' ' }}
                <span class="text-fg-secondary">
                  {{ formatActivityText(activity) }}
                </span>
              </p>
              <span class="flex-shrink-0 text-xs text-fg-muted">
                {{ formatTime(activity.created_at) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Find More -->
      <div v-if="activities.length > 0" class="mt-8 text-center">
        <NuxtLink to="/players" class="text-sm text-primary hover:underline">
          Find more players to follow
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
