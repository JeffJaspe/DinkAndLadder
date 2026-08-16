<script setup lang="ts">
interface Player {
  id: string
  displayName: string
  avatarUrl?: string
}

interface Props {
  id: string
  date: string
  matchType: 'singles' | 'doubles'
  player1: Player
  player2: Player
  partner1?: Player
  partner2?: Player
  scores: Array<{ player1: number; player2: number }>
  winnerId: string
  status: 'pending' | 'verified' | 'disputed'
  ratingChange?: number
}

const props = defineProps<Props>()

const formattedDate = computed(() => {
  return new Date(props.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
})

const scoreDisplay = computed(() => {
  return props.scores.map(s => `${s.player1}-${s.player2}`).join(', ')
})

const player1Won = computed(() => props.winnerId === props.player1.id)
</script>

<template>
  <NuxtLink
    :to="`/matches/${id}`"
    class="group block rounded-card bg-surface p-4 shadow-card transition-all hover:shadow-card-hover hover:ring-1 hover:ring-primary/50"
  >
    <!-- Header -->
    <div class="flex items-center justify-between">
      <span class="text-sm text-text-muted">{{ formattedDate }}</span>
      <UiStatusPill :status="status" size="sm" />
    </div>

    <!-- Players -->
    <div class="mt-3 flex items-center justify-between gap-4">
      <!-- Player/Team 1 -->
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <div class="relative">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-light text-sm font-semibold"
            :class="player1Won ? 'ring-2 ring-success' : ''"
          >
            {{ player1.displayName.charAt(0) }}
          </div>
          <svg
            v-if="player1Won"
            class="absolute -right-1 -top-1 h-4 w-4 text-success"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="min-w-0">
          <p class="truncate font-medium text-text-primary">{{ player1.displayName }}</p>
          <p v-if="partner1" class="truncate text-sm text-text-muted">& {{ partner1.displayName }}</p>
        </div>
      </div>

      <!-- Score -->
      <div class="flex-shrink-0 text-center">
        <span class="text-lg font-bold text-text-primary">{{ scoreDisplay }}</span>
        <UiTrendIndicator
          v-if="ratingChange !== undefined"
          :value="ratingChange"
          size="sm"
          class="mt-1"
        />
      </div>

      <!-- Player/Team 2 -->
      <div class="flex min-w-0 flex-1 flex-row-reverse items-center gap-3">
        <div class="relative">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-light text-sm font-semibold"
            :class="!player1Won ? 'ring-2 ring-success' : ''"
          >
            {{ player2.displayName.charAt(0) }}
          </div>
          <svg
            v-if="!player1Won"
            class="absolute -left-1 -top-1 h-4 w-4 text-success"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="min-w-0 text-right">
          <p class="truncate font-medium text-text-primary">{{ player2.displayName }}</p>
          <p v-if="partner2" class="truncate text-sm text-text-muted">& {{ partner2.displayName }}</p>
        </div>
      </div>
    </div>
  </NuxtLink>
</template>
