<script setup lang="ts">
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
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <!-- Header -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Notifications</h1>
          <p v-if="unreadCount?.count" class="mt-1 text-sm text-[#6B7B75]">
            {{ unreadCount.count }} unread
          </p>
        </div>
        <button
          v-if="notifications.some(n => !n.is_read)"
          class="rounded-lg px-4 py-2 text-sm font-medium text-[#4DB175] hover:bg-[#4DB175]/10"
          @click="markAllAsRead"
        >
          Mark all as read
        </button>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="space-y-3">
        <div v-for="i in 5" :key="i" class="h-20 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Empty -->
      <div v-else-if="notifications.length === 0" class="rounded-xl bg-[#1E2E2A] p-12 text-center">
        <p class="text-4xl">🔔</p>
        <h3 class="mt-4 text-lg font-semibold text-white">No notifications</h3>
        <p class="mt-2 text-sm text-[#6B7B75]">You're all caught up!</p>
      </div>

      <!-- Notifications List -->
      <div v-else class="space-y-2">
        <component
          :is="getNotificationLink(notification) ? 'NuxtLink' : 'div'"
          v-for="notification in notifications"
          :key="notification.id"
          :to="getNotificationLink(notification)"
          class="flex items-start gap-4 rounded-xl p-4 transition-all"
          :class="[
            notification.is_read ? 'bg-[#1E2E2A]' : 'bg-[#1E2E2A] ring-1 ring-[#4DB175]/20',
            getNotificationLink(notification) ? 'hover:bg-[#2E4540] cursor-pointer' : ''
          ]"
          @click="!notification.is_read && markAsRead(notification.id)"
        >
          <!-- Icon -->
          <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#2E4540] text-xl">
            {{ getNotificationIcon(notification.type) }}
          </div>

          <!-- Content -->
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-medium" :class="notification.is_read ? 'text-[#A6ABA7]' : 'text-white'">
                {{ notification.title }}
              </h3>
              <span class="flex-shrink-0 text-xs text-[#6B7B75]">
                {{ formatTime(notification.created_at) }}
              </span>
            </div>
            <p class="mt-1 text-sm text-[#6B7B75]">{{ notification.body }}</p>
          </div>

          <!-- Unread Indicator -->
          <div
            v-if="!notification.is_read"
            class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-[#4DB175]"
          />
        </component>
      </div>
    </div>
  </div>
</template>
