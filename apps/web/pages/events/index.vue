<script setup lang="ts">
import type { EventDto } from '~/server/domains/event/dto/event.dto'

interface EventsResponse {
  events: EventDto[]
}

const { data, pending, error } = await useFetch<EventsResponse>('/api/v1/events')

const statusConfig: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-[#3A5750]', text: 'text-[#6B7B75]' },
  published: { bg: 'bg-[#4DB175]/20', text: 'text-[#4DB175]' },
  in_progress: { bg: 'bg-[#4DB175]/20', text: 'text-[#4DB175]' },
  completed: { bg: 'bg-[#B5B9F0]/20', text: 'text-[#B5B9F0]' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' }
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const startStr = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endStr = endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  if (startStr === endStr.replace(/, \d{4}$/, '')) {
    return endStr
  }
  return `${startStr} - ${endStr}`
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-3xl">
      <!-- Header -->
      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Events</h1>
          <p class="mt-1 text-sm text-[#6B7B75]">Tournaments and competitions</p>
        </div>
        <NuxtLink
          to="/create-event"
          class="inline-flex items-center gap-2 rounded-xl bg-[#4DB175] px-4 py-2 font-medium text-white hover:bg-[#5FC287]"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create Event
        </NuxtLink>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="space-y-3">
        <div v-for="i in 4" :key="i" class="h-24 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">Could not load events.</p>
      </div>

      <!-- Empty -->
      <div v-else-if="!data?.events.length" class="rounded-xl bg-[#1E2E2A] p-12 text-center">
        <p class="text-4xl">🎪</p>
        <h3 class="mt-4 text-lg font-semibold text-white">No events yet</h3>
        <p class="mt-2 text-sm text-[#6B7B75]">Be the first to create a tournament or competition</p>
        <NuxtLink to="/create-event" class="mt-4 inline-block rounded-lg bg-[#4DB175] px-4 py-2 text-white">
          Create Event
        </NuxtLink>
      </div>

      <!-- Events List -->
      <div v-else class="space-y-3">
        <NuxtLink
          v-for="event in data.events"
          :key="event.id"
          :to="`/events/${event.id}`"
          class="block rounded-xl bg-[#1E2E2A] p-5 transition-all hover:bg-[#2E4540]"
        >
          <div class="flex items-start justify-between">
            <div>
              <h2 class="font-semibold text-white">{{ event.name }}</h2>
              <p class="mt-1 text-sm text-[#6B7B75]">
                {{ formatDateRange(event.start_date, event.end_date) }}
              </p>
              <p v-if="event.venue || event.city" class="mt-1 text-sm text-[#6B7B75]">
                {{ [event.venue, event.city].filter(Boolean).join(', ') }}
              </p>
            </div>
            <span
              class="rounded-md px-2 py-0.5 text-xs font-medium capitalize"
              :class="statusConfig[event.status]?.bg + ' ' + statusConfig[event.status]?.text"
            >
              {{ event.status.replace('_', ' ') }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
