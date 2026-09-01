<script setup lang="ts">
import {
  categoryOf,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory
} from '~/utils/notification-categories'
useHead({ title: 'Notifications' })

/**
 * Mirrors NotificationDto exactly — see
 * server/domains/notification/dto/notification.dto.ts.
 *
 * This page previously declared `is_read` and a free-form `data` bag. The API
 * has never sent either: `toNotificationDto()` emits `read`, and the payload is
 * a typed `reference_type`/`reference_id` pair, not a bag. Both fields were
 * therefore permanently undefined, which silently disabled every unread
 * indicator, the "Mark all as read" button and all deep links — notifications
 * arrived and looked inert.
 */
interface Notification {
  id: string
  type: string
  title: string
  body: string
  reference_type: string | null
  reference_id: string | null
  read: boolean
  created_at: string
}

const { data, pending, refresh } = await useFetch<{ notifications: Notification[] }>(
  '/api/v1/notifications'
)
// Shared with the sidebar and mobile-header bell badges, so marking one read
// updates all three from a single request.
const { unreadCount, refreshUnreadNotificationCount: refreshCount } = useUnreadNotificationCount()

const allNotifications = computed(() => data.value?.notifications ?? [])

/**
 * Category filter.
 *
 * The list was one undifferentiated stream, so "did anyone ask to team up
 * with me?" meant scrolling past every rating recalculation. Filtering is
 * client-side because the whole page is already fetched — a round trip per
 * tab would be slower than the filter it replaces.
 */
const activeCategory = ref<NotificationCategory | 'all'>('all')

const notifications = computed(() =>
  activeCategory.value === 'all'
    ? allNotifications.value
    : allNotifications.value.filter((n) => categoryOf(n.type) === activeCategory.value)
)

/** Unread per tab, so a quiet category is visibly quiet rather than just empty. */
const unreadByCategory = computed(() => {
  const counts: Record<string, number> = { all: 0 }
  for (const notification of allNotifications.value) {
    if (notification.read) continue
    counts.all += 1
    const category = categoryOf(notification.type)
    counts[category] = (counts[category] ?? 0) + 1
  }
  return counts
})

/**
 * Grouped by day — Today / Yesterday / an explicit date (docs/33 §5.7).
 *
 * Recency grouping beats a column of raw timestamps for triage: the question a
 * notification list answers is "what happened since I last looked", and a
 * heading answers it faster than reading and subtracting nine timestamps.
 *
 * Groups keep the server's ordering rather than re-sorting, so an API change to
 * the sort does not silently disagree with the headings.
 */
function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(iso: string): string {
  const key = dayKey(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (key === dayKey(now.toISOString())) return 'Today'
  if (key === dayKey(yesterday.toISOString())) return 'Yesterday'

  const d = new Date(iso)
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric'
  })
}

const groupedNotifications = computed(() => {
  const groups: Array<{ label: string; items: Notification[] }> = []
  for (const notification of notifications.value) {
    const label = dayLabel(notification.created_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(notification)
    else groups.push({ label, items: [notification] })
  }
  return groups
})

async function markAsRead(notificationId: string) {
  await $fetch(`/api/v1/notifications/${notificationId}/read`, { method: 'PATCH' })
  await refresh()
  await refreshCount()
}

async function markAllAsRead() {
  await $fetch('/api/v1/notifications/mark-all-read', { method: 'POST' })
  await refresh()
  await refreshCount()
}

function getNotificationIcon(type: string): string {
  switch (type) {
    case 'match.verification_requested':
      return '🎯'
    case 'match.verified':
      return '✅'
    case 'match.rejected':
      return '❌'
    case 'club.membership_approved':
      return '🏸'
    case 'club.membership_rejected':
      return '🚫'
    case 'achievement.unlocked':
      return '🏆'
    case 'social.new_follower':
      return '👤'
    default:
      return '🔔'
  }
}

/**
 * Where a notification takes you.
 *
 * Keyed off `reference_type`, which is the field the API actually populates
 * (NotificationReferenceType). The previous version read `notification.data`,
 * a field that has never been sent, so this returned null every time and every
 * row rendered as an inert `<div>` instead of a link.
 */
function getNotificationLink(notification: Notification): string | null {
  const id = notification.reference_id
  if (!id) return null

  switch (notification.reference_type) {
    case 'match':
    case 'match_verification':
      return `/matches/${id}`
    case 'club_membership':
      // The membership id is not the club id, so this cannot deep-link to one
      // club. My Clubs is where a membership decision is acted on.
      return '/my-clubs'
    case 'club_announcement':
      return '/feed'
    case 'partner_request':
    case 'partnership':
      return '/community?tab=partners'
    // Emitted by both team-up endpoints and declared in
    // NotificationReferenceType, but never handled here — so every team-up
    // notification fell through to `default` and rendered as an inert div.
    // Clicking one appeared to do nothing, which is what "the notification
    // stays in notifications" was.
    case 'team_up':
      return '/community?tab=team'
    case 'player_rating':
      return '/dashboard'
    case 'player_report':
      // Only ever sent to the reported player, and deliberately carries no
      // pointer to the reporter. Their own settings is the honest destination.
      return '/settings'
    default:
      return null
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
          <h1 class="text-2xl font-bold text-fg">Notifications</h1>
          <p v-if="unreadCount" class="mt-1 text-sm text-fg-muted">{{ unreadCount }} unread</p>
        </div>
        <button
          v-if="allNotifications.some((n) => !n.read)"
          class="rounded-lg px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          @click="markAllAsRead"
        >
          Mark all as read
        </button>
      </div>

      <!-- Category filter. Account, Clubs, Community, Warnings — the four
           things worth looking at separately. -->
      <div class="mb-4 flex flex-wrap gap-2">
        <button
          v-for="category in NOTIFICATION_CATEGORIES"
          :key="category.value"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-body-2 transition-colors"
          :class="
            activeCategory === category.value
              ? 'bg-primary text-on-primary'
              : 'bg-surface text-fg-secondary hover:bg-surface-2'
          "
          @click="activeCategory = category.value"
        >
          {{ category.label }}
          <span
            v-if="unreadByCategory[category.value]"
            class="rounded-pill px-1.5 text-caption font-semibold tabular-nums"
            :class="
              activeCategory === category.value
                ? 'bg-on-primary/20 text-on-primary'
                : 'bg-primary text-on-primary'
            "
            >{{ unreadByCategory[category.value] }}</span
          >
        </button>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="space-y-3">
        <div v-for="i in 5" :key="i" class="h-20 animate-pulse rounded-xl bg-surface" />
      </div>

      <!-- Empty -->
      <div
        v-else-if="notifications.length === 0"
        class="rounded-xl bg-surface p-12 text-center shadow-card"
      >
        <p class="text-4xl">🔔</p>
        <h3 class="mt-4 text-lg font-semibold text-fg">
          {{ activeCategory === 'all' ? 'No notifications' : 'Nothing in here' }}
        </h3>
        <p class="mt-2 text-sm text-fg-muted">
          {{
            activeCategory === 'all'
              ? 'You\u2019re all caught up!'
              : 'Nothing under this heading yet. Try another tab.'
          }}
        </p>
      </div>

      <!-- Notifications, grouped by day -->
      <div v-else class="space-y-5">
        <section v-for="group in groupedNotifications" :key="group.label" class="space-y-2">
          <h2 class="text-caption font-semibold uppercase tracking-wide text-fg-muted">
            {{ group.label }}
          </h2>
          <component
            :is="getNotificationLink(notification) ? 'NuxtLink' : 'div'"
            v-for="notification in group.items"
            :key="notification.id"
            :to="getNotificationLink(notification)"
            class="flex items-start gap-4 rounded-xl p-4 transition-all"
            :class="[
              notification.read ? 'bg-surface' : 'bg-surface ring-1 ring-primary/20',
              getNotificationLink(notification) ? 'hover:bg-surface-2 cursor-pointer' : ''
            ]"
            @click="!notification.read && markAsRead(notification.id)"
          >
            <!-- Icon -->
            <div
              class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-xl"
            >
              {{ getNotificationIcon(notification.type) }}
            </div>

            <!-- Content -->
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <h3
                  class="font-medium"
                  :class="notification.read ? 'text-fg-secondary' : 'text-fg'"
                >
                  {{ notification.title }}
                </h3>
                <span class="flex-shrink-0 text-xs text-fg-muted">
                  {{ formatTime(notification.created_at) }}
                </span>
              </div>
              <p class="mt-1 text-sm text-fg-muted">{{ notification.body }}</p>
            </div>

            <!-- Unread Indicator -->
            <div
              v-if="!notification.read"
              class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-primary"
            />
          </component>
        </section>
      </div>
    </div>
  </div>
</template>
