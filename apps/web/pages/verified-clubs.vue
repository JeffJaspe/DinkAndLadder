<script setup lang="ts">
import type { ClubDto } from '~/server/domains/club/dto/club.dto'

const {
  data: response,
  pending,
  error
} = await useFetch<{ data: ClubDto[] }>('/api/v1/verified-clubs')

const clubs = computed(() => response.value?.data ?? [])
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-white">Verified Clubs</h1>
      <p class="mt-1 text-sm text-[#6B7B75]">
        Clubs reviewed and verified by the DinkAndLadder team.
      </p>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 6" :key="i" class="h-32 animate-pulse rounded-xl bg-[#1E2E2A]" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center">
      <p class="text-red-400">Could not load verified clubs. Please try again.</p>
      <button class="mt-4 rounded-lg bg-[#4DB175] px-4 py-2 text-white" @click="$router.go(0)">
        Retry
      </button>
    </div>

    <!-- Empty -->
    <div v-else-if="!clubs.length" class="rounded-xl bg-[#1E2E2A] p-12 text-center">
      <p class="text-4xl">🏆</p>
      <h3 class="mt-4 text-lg font-semibold text-white">No verified clubs yet</h3>
      <p class="mt-2 text-sm text-[#6B7B75]">
        Club owners can request verification from their club's settings page.
      </p>
    </div>

    <!-- Clubs grid -->
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="club in clubs"
        :key="club.id"
        :to="`/clubs/${club.id}`"
        class="rounded-xl bg-[#1E2E2A] p-5 transition-colors hover:bg-[#2E4540]/40"
      >
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold text-white">{{ club.name }}</h3>
          <VerifiedBadge size="sm" />
        </div>
        <p v-if="club.description" class="mt-2 line-clamp-2 text-sm text-[#6B7B75]">
          {{ club.description }}
        </p>
        <p v-if="club.city || club.province" class="mt-3 text-xs text-[#6B7B75]">
          {{ [club.city, club.province].filter(Boolean).join(', ') }}
        </p>
      </NuxtLink>
    </div>
  </div>
</template>
