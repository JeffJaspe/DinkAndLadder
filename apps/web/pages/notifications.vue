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
  // Fire and forget - don't block navigation
  $fetch(`/api/v1/notifications/${notificationId}/read`, { method: 'PATCH' })
    .then(() => {
      refresh()
      refreshCount()
    })
    .catch(() => {
      // Silent fail - marking as read is not critical
    })
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
 * First tries `reference_type` + `reference_id` for deep links. Falls back to
 * notification `type` for a sensible destination when the reference is missing.
 * Every notification should be clickable — an inert notification feels broken.
 */
function getNotificationLink(notification: Notification): string {
  const id = notification.reference_id

  // Deep link by reference_type when we have an id
  if (id) {
    switch (notification.reference_type) {
      case 'match':
      case 'match_verification':
        return `/matches/${id}`
      case 'club_membership':
        return '/my-clubs'
      case 'club_announcement':
        return '/feed'
      case 'partner_request':
      case 'partnership':
        return '/community?tab=partners'
      case 'team_up':
        return '/community?tab=team'
      case 'event':
        return `/events/${id}`
      case 'achievement':
        return '/achievements'
      case 'player_rating':
        return '/dashboard'
      case 'player_report':
        return '/settings'
    }
  }

  // Fallback by notification type when reference is missing
  switch (notification.type) {
    case 'match.verification_requested':
    case 'match.verified':
    case 'match.rejected':
    case 'match.disputed':
      return id ? `/matches/${id}` : '/matches'
    case 'club.membership_approved':
    case 'club.membership_rejected':
    case 'club.membership_request':
    case 'club.invited':
    case 'club.role_changed':
      return '/my-clubs'
    case 'club.announcement':
      return '/feed'
    case 'rating.updated':
      return '/dashboard'
    case 'partner.request_received':
    case 'partner.request_accepted':
    case 'partner.request_declined':
      return '/community?tab=partners'
    case 'moderation.warning':
      return '/settings'
    case 'event.auto_closed':
      return id ? `/events/${id}` : '/events'
    case 'achievement.unlocked':
      return '/achievements'
    default:
      // Last resort: dashboard is the home base
      return '/dashboard'
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
          <h1 class="font-display text-heading-1 text-fg">Notifications</h1>
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
        <span
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-surface-2 text-fg-muted"
        >
          <UiIcon name="bell" size="h-6 w-6" />
        </span>
        <h3 class="mt-4 font-display text-heading-3 text-fg">
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
          <h2 class="text-caption font-semibold uppercase tracking-widest text-fg-muted">
            {{ group.label }}
          </h2>
          <NuxtLink
            v-for="notification in group.items"
            :key="notification.id"
            :to="getNotificationLink(notification)"
            class="flex items-start gap-4 rounded-xl p-4 transition-all hover:bg-surface-2 cursor-pointer"
            :class="notification.read ? 'bg-surface' : 'bg-surface ring-1 ring-primary/20'"
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
          </NuxtLink>
        </section>

        <p class="mt-6 border-t border-border pt-4 text-caption text-fg-muted">
          {{ RETENTION_NOTICE }}
        </p>
      </div>
    </div>
  </div>
</template>
