<script setup lang="ts">
import type { EventDto } from '~/server/domains/event/dto/event.dto'

useHead({ title: 'Feed' })

interface LinkedEvent {
  id: string
  name: string
  start_date: string | null
  city: string | null
  venue: string | null
}

interface Activity {
  id: string
  activity_type: string
  actor_player_id: string | null
  actor_display_name?: string
  metadata: Record<string, unknown> | null
  created_at: string
  /** Present when a shout-out was posted against an event. */
  event?: LinkedEvent | null
}

const { data, status, error, refresh } = await useFetch<{ activities: Activity[] }>('/api/v1/feed')

const activities = computed(() => data.value?.activities ?? [])

/**
 * The feed is a log of things that already happened, so an event published a
 * month ago but starting next week sinks out of sight — "coming soon" was
 * effectively invisible. This reads the events list directly rather than
 * inventing synthetic activity rows for something that has not occurred yet.
 */
const { data: eventsData } = useLazyFetch<{ events: EventDto[] }>('/api/v1/events', {
  query: { limit: 20 },
  default: () => ({ events: [] as EventDto[] })
})

const upcomingEvents = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return (eventsData.value?.events ?? [])
    .filter((e) => e.status === 'published' && e.start_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 3)
})

function formatEventDate(startDate: string | null): string {
  if (!startDate) return ''
  return new Date(startDate).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

const ACTIVITY_ICONS: Record<string, string> = {
  'match.verified': '🎯',
  'rating.changed': '📈',
  'social.started_following': '👤',
  'social.shoutout': '📣',
  'achievement.earned': '🏆',
  'achievement.unlocked': '🏆',
  'club.member_joined': '🏸',
  'club.joined': '🏸',
  'club.event_created': '📅',
  'club.announcement': '📢',
  'profile.updated': '✏️',
  'tournament.registered': '🎪'
}

function getActivityIcon(type: string): string {
  return ACTIVITY_ICONS[type] ?? '📌'
}

/**
 * A shout-out is the one activity whose body is the point — it is the player's
 * own words, not a system description of something they did. It gets pulled out
 * of the sentence and given its own block below, so the others can stay as a
 * one-line "X did Y".
 */
function shoutoutMessage(activity: Activity): string | null {
  if (activity.activity_type !== 'social.shoutout') return null
  const message = (activity.metadata as Record<string, string> | null)?.message
  return message || null
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
      return 'posted a shout-out'
    case 'achievement.earned':
    case 'achievement.unlocked':
      return `unlocked achievement: ${meta.achievement_name ?? 'New Achievement'}`
    case 'club.member_joined':
    case 'club.joined':
      return `joined club ${meta.club_name ?? ''}`
    case 'club.event_created':
      return `created an event${meta.event_name ? `: ${meta.event_name}` : ''}`
    case 'club.announcement':
      return 'posted an announcement'
    case 'profile.updated':
      return 'updated their profile'
    case 'tournament.registered':
      return `registered for ${meta.tournament_name ?? 'a tournament'}`
    default:
      return activity.activity_type.replace('.', ' ')
  }
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const diffMs = Date.now() - date.getTime()
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
    <!-- Narrower than the usual page-shell on purpose. A feed is read top to
         bottom, one item at a time, and a full-width row makes the eye travel
         a long way for a single short sentence. -->
    <div class="mx-auto max-w-2xl">
      <div class="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-fg">Feed</h1>
          <p class="mt-1 text-sm text-fg-muted">
            Everyone's activity, closest to you first — your barangay, then your city, then your
            province.
          </p>
        </div>
        <button
          class="rounded-button p-2 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          aria-label="Refresh feed"
          @click="refresh()"
        >
          <UiIcon name="refresh" />
        </button>
      </div>

      <!-- Coming up. Sits above the log deliberately: the feed is a record of
           the past, so an event that has not happened yet would otherwise never
           surface here at all. Vertical, like everything else on this page —
           the horizontal strip it replaced hid its last cards off-screen. -->
      <section v-if="upcomingEvents.length" class="mb-6 space-y-2">
        <h2 class="text-caption font-semibold uppercase tracking-wide text-fg-muted">Coming up</h2>
        <NuxtLink
          v-for="upcoming in upcomingEvents"
          :key="upcoming.id"
          :to="`/events/${upcoming.id}`"
          class="flex items-center gap-3 rounded-card border-l-2 border-primary bg-surface p-3 shadow-card transition-colors hover:bg-surface-2"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-body-2 font-medium text-fg">{{ upcoming.name }}</span>
            <span
              v-if="upcoming.venue || upcoming.city"
              class="block truncate text-caption text-fg-muted"
            >
              {{ [upcoming.venue, upcoming.city].filter(Boolean).join(', ') }}
            </span>
          </span>
          <span class="shrink-0 text-caption font-medium text-primary">
            {{ formatEventDate(upcoming.start_date) }}
          </span>
        </NuxtLink>
      </section>

      <!-- Loading -->
      <div v-if="status === 'pending'" class="space-y-3">
        <div v-for="i in 5" :key="i" class="h-24 animate-pulse rounded-card bg-surface" />
      </div>

      <UiErrorState
        v-else-if="error"
        title="Could not load the feed"
        message="Something went wrong fetching activity."
        @retry="refresh()"
      />

      <UiEmptyState
        v-else-if="activities.length === 0"
        title="Nothing here yet"
        message="When players near you record matches, join clubs or post shout-outs, it shows up here."
        action-label="Find players"
        action-to="/players"
      />

      <!-- The feed itself: one column, newest first inside each proximity band. -->
      <div v-else class="space-y-3">
        <article
          v-for="activity in activities"
          :key="activity.id"
          class="rounded-card bg-surface p-4 shadow-card"
        >
          <div class="flex gap-3">
            <span
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xl"
              aria-hidden="true"
            >
              {{ getActivityIcon(activity.activity_type) }}
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-2">
                <p class="min-w-0 text-body-2">
                  <NuxtLink
                    v-if="activity.actor_player_id"
                    :to="`/players/${activity.actor_player_id}`"
                    class="font-medium text-primary hover:underline"
                  >
                    {{ activity.actor_display_name }}
                  </NuxtLink>
                  <span v-else class="font-medium text-fg">{{ activity.actor_display_name }}</span>
                  <span class="text-fg-secondary"> {{ formatActivityText(activity) }}</span>
                </p>
                <time :datetime="activity.created_at" class="shrink-0 text-caption text-fg-muted">{{
                  formatTime(activity.created_at)
                }}</time>
              </div>

              <!-- The shout-out's own words, given room rather than squeezed
                   into the sentence above in quotes. -->
              <blockquote
                v-if="shoutoutMessage(activity)"
                class="mt-2 border-l-2 border-primary/40 py-0.5 pl-3 text-body text-fg"
              >
                {{ shoutoutMessage(activity) }}
              </blockquote>

              <!-- The event a shout-out points at, if any. -->
              <NuxtLink
                v-if="activity.event"
                :to="`/events/${activity.event.id}`"
                class="mt-2 flex items-center gap-2 rounded-button bg-canvas p-2.5 transition-colors hover:bg-surface-2"
              >
                <UiIcon name="calendar" size="h-4 w-4" class="shrink-0 text-primary" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-body-2 font-medium text-fg">
                    {{ activity.event.name }}
                  </span>
                  <span class="block truncate text-caption text-fg-muted">
                    {{
                      [formatEventDate(activity.event.start_date), activity.event.city]
                        .filter(Boolean)
                        .join(' · ')
                    }}
                  </span>
                </span>
              </NuxtLink>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
