<script setup lang="ts">
import type { EventDto } from '~/server/domains/event/dto/event.dto'
import type { TournamentDto } from '~/server/domains/event/dto/tournament.dto'

interface TournamentsResponse {
  tournaments: TournamentDto[]
}

const route = useRoute()
const eventId = route.params.eventId as string

const { data: event, pending: eventPending, error: eventError } = await useFetch<EventDto>(
  `/api/v1/events/${eventId}`
)

const { data: tournamentsData, pending: tournamentsPending, error: tournamentsError } = await useFetch<TournamentsResponse>(
  `/api/v1/events/${eventId}/tournaments`
)

const statusConfig: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-[#3A5750]', text: 'text-[#6B7B75]' },
  published: { bg: 'bg-[#4DB175]/20', text: 'text-[#4DB175]' },
  open: { bg: 'bg-[#4DB175]/20', text: 'text-[#4DB175]' },
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
      <!-- Loading -->
      <div v-if="eventPending" class="space-y-4">
        <div class="h-36 animate-pulse rounded-xl bg-[#1E2E2A]" />
        <div class="h-48 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Error -->
      <div v-else-if="eventError" class="rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">Could not load event.</p>
        <NuxtLink to="/events" class="mt-4 inline-block text-sm text-[#4DB175] hover:underline">
          Back to events
        </NuxtLink>
      </div>

      <template v-else-if="event">
        <!-- Event Header -->
        <div class="mb-6 rounded-xl bg-[#1E2E2A] p-6">
          <div class="flex items-start justify-between">
            <div>
              <h1 class="text-2xl font-bold text-white">{{ event.name }}</h1>
              <p class="mt-2 text-[#6B7B75]">
                {{ formatDateRange(event.start_date, event.end_date) }}
              </p>
              <p v-if="event.venue || event.city" class="text-[#6B7B75]">
                {{ [event.venue, event.city].filter(Boolean).join(', ') }}
              </p>
            </div>
            <span
              class="rounded-md px-3 py-1 text-xs font-medium capitalize"
              :class="statusConfig[event.status]?.bg + ' ' + statusConfig[event.status]?.text"
            >
              {{ event.status.replace('_', ' ') }}
            </span>
          </div>
          <p v-if="event.description" class="mt-4 text-[#A6ABA7]">
            {{ event.description }}
          </p>
        </div>

        <!-- Tournaments -->
        <div class="rounded-xl bg-[#1E2E2A] p-6">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-white">Tournaments</h2>
            <NuxtLink
              :to="`/events/${eventId}/create-tournament`"
              class="inline-flex items-center gap-2 rounded-lg bg-[#4DB175] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#5FC287]"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Add Tournament
            </NuxtLink>
          </div>

          <!-- Loading -->
          <div v-if="tournamentsPending" class="space-y-3">
            <div v-for="i in 3" :key="i" class="h-20 animate-pulse rounded-lg bg-[#0B0D09]" />
          </div>

          <!-- Error -->
          <div v-else-if="tournamentsError" class="rounded-lg bg-red-500/10 p-4 text-center">
            <p class="text-red-400">Could not load tournaments.</p>
          </div>

          <!-- Empty -->
          <div v-else-if="!tournamentsData?.tournaments.length" class="text-center">
            <p class="text-[#6B7B75]">No tournaments yet.</p>
          </div>

          <!-- Tournaments List -->
          <div v-else class="space-y-3">
            <NuxtLink
              v-for="tournament in tournamentsData.tournaments"
              :key="tournament.id"
              :to="`/tournaments/${tournament.id}`"
              class="block rounded-lg bg-[#0B0D09] p-4 transition-all hover:bg-[#2E4540]"
            >
              <div class="flex items-start justify-between">
                <div>
                  <h3 class="font-medium text-white">{{ tournament.name }}</h3>
                  <p class="mt-1 text-sm text-[#6B7B75]">
                    <span class="capitalize">{{ tournament.format.replace(/_/g, ' ') }}</span>
                    <span class="mx-1">·</span>
                    <span class="capitalize">{{ tournament.match_type }}</span>
                    <template v-if="tournament.min_rating || tournament.max_rating">
                      <span class="mx-1">·</span>
                      <span>{{ tournament.min_rating ?? '—' }} – {{ tournament.max_rating ?? '—' }} rating</span>
                    </template>
                  </p>
                </div>
                <span
                  class="rounded-md px-2 py-0.5 text-xs font-medium capitalize"
                  :class="statusConfig[tournament.status]?.bg + ' ' + statusConfig[tournament.status]?.text"
                >
                  {{ tournament.status }}
                </span>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Back Link -->
        <div class="mt-6 text-center">
          <NuxtLink to="/events" class="text-sm text-[#4DB175] hover:underline">
            Back to events
          </NuxtLink>
        </div>
      </template>
    </div>
  </div>
</template>
