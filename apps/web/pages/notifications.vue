<script setup lang="ts">
useHead({ title: 'Notifications' })

interface Notification {
  id: string
  type: string
  title: string
  body: string
  data: Record<string, unknown>
  is_read: boolean
  created_at: string
}

const { data, pending, refresh } = await useFetch<{ notifications: Notification[] }>('/api/v1/notifications')
const { data: unreadCount, refresh: refreshCount } = await useFetch<{ count: number }>('/api/v1/notifications/unread-count')

const notifications = computed(() => data.value?.notifications ?? [])

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
  const groups: Array<{ label: string, items: Notification[] }> = []
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
    case 'match.verification_requested': return '🎯'
    case 'match.verified': return '✅'
    case 'match.rejected': return '❌'
    case 'club.membership_approved': return '🏸'
    case 'club.membership_rejected': return '🚫'
    case 'achievement.unlocked': return '🏆'
    case 'social.new_follower': return '👤'
    default: return '🔔'
  }
}

function getNotificationLink(notification: Notification): string | null {
  const data = notification.data as Record<string, string>
  switch (notification.type) {
    case 'match.verification_requested':
    case 'match.verified':
    case 'match.rejected':
      return data.match_id ? `/matches/${data.match_id}` : null
    case 'club.membership_approved':
    case 'club.membership_rejected':
      return data.club_id ? `/clubs/${data.club_id}` : null
    case 'social.new_follower':
      return data.follower_id ? `/players/${data.follower_id}` : null
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
          <p v-if="unreadCount?.count" class="mt-1 text-sm text-fg-muted">
            {{ unreadCount.count }} unread
          </p>
        </div>
        <button
          v-if="notifications.some(n => !n.is_read)"
          class="rounded-lg px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          @click="markAllAsRead"
        >
          Mark all as read
        </button>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="space-y-3">
        <div v-for="i in 5" :key="i" class="h-20 animate-pulse rounded-xl bg-surface" />
      </div>

      <!-- Empty -->
      <div v-else-if="notifications.length === 0" class="rounded-xl bg-surface p-12 text-center">
        <p class="text-4xl">🔔</p>
        <h3 class="mt-4 text-lg font-semibold text-fg">No notifications</h3>
        <p class="mt-2 text-sm text-fg-muted">You're all caught up!</p>
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
            notification.is_read ? 'bg-surface' : 'bg-surface ring-1 ring-primary/20',
            getNotificationLink(notification) ? 'hover:bg-surface-2 cursor-pointer' : ''
          ]"
          @click="!notification.is_read && markAsRead(notification.id)"
        >
          <!-- Icon -->
          <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-xl">
            {{ getNotificationIcon(notification.type) }}
          </div>

          <!-- Content -->
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-medium" :class="notification.is_read ? 'text-fg-secondary' : 'text-fg'">
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
            v-if="!notification.is_read"
            class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-primary"
          />
          </component>
        </section>
      </div>
    </div>
  </div>
</template>
