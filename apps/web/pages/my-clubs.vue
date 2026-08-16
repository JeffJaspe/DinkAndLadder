<script setup lang="ts">
import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'

interface PageResponse {
  items: MyClubMembershipDto[]
}

const { data, pending, error } = await useFetch<PageResponse>('/api/v1/clubs/mine')

const roleColors: Record<string, string> = {
  OWNER: 'bg-[#F5A623] text-[#0B0D09]',
  ADMIN: 'bg-[#B5B9F0] text-[#0B0D09]',
  MODERATOR: 'bg-[#4DB175] text-white',
  MEMBER: 'bg-[#3A5750] text-[#A6ABA7]'
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-3xl">
      <!-- Header -->
      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">My Clubs</h1>
          <p class="mt-1 text-sm text-[#6B7B75]">Clubs you've joined or created</p>
        </div>
        <NuxtLink
          to="/create-club"
          class="inline-flex items-center gap-2 rounded-xl bg-[#4DB175] px-4 py-2 font-medium text-white hover:bg-[#5FC287]"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create Club
        </NuxtLink>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="space-y-3">
        <div v-for="i in 3" :key="i" class="h-24 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">Could not load your clubs. Please try again.</p>
      </div>

      <!-- Empty -->
      <div v-else-if="!data?.items.length" class="rounded-xl bg-[#1E2E2A] p-12 text-center">
        <p class="text-4xl">🏸</p>
        <h3 class="mt-4 text-lg font-semibold text-white">No clubs yet</h3>
        <p class="mt-2 text-sm text-[#6B7B75]">Join a club to connect with other players, or create your own</p>
        <NuxtLink to="/clubs" class="mt-4 inline-block rounded-lg bg-[#4DB175] px-4 py-2 text-white">
          Discover Clubs
        </NuxtLink>
      </div>

      <!-- Clubs List -->
      <div v-else class="space-y-3">
        <NuxtLink
          v-for="membership in data.items"
          :key="membership.id"
          :to="`/clubs/${membership.club.id}`"
          class="flex items-center gap-4 rounded-xl bg-[#1E2E2A] p-4 transition-all hover:bg-[#2E4540]"
        >
          <!-- Logo -->
          <div class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-[#2E4540] text-xl font-bold text-[#A6ABA7]">
            {{ membership.club.name.charAt(0).toUpperCase() }}
          </div>

          <!-- Info -->
          <div class="min-w-0 flex-1">
            <h3 class="font-semibold text-white">{{ membership.club.name }}</h3>
            <p v-if="membership.club.city || membership.club.province" class="mt-0.5 text-sm text-[#6B7B75]">
              {{ [membership.club.city, membership.club.province].filter(Boolean).join(', ') }}
            </p>
          </div>

          <!-- Role Badge -->
          <span
            class="rounded-md px-2 py-0.5 text-xs font-medium"
            :class="roleColors[membership.role] || roleColors.MEMBER"
          >
            {{ membership.role }}
          </span>

          <!-- Arrow -->
          <svg class="h-5 w-5 flex-shrink-0 text-[#6B7B75]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </NuxtLink>
      </div>

      <!-- Discover Link -->
      <div class="mt-8 text-center">
        <NuxtLink to="/clubs" class="text-sm text-[#4DB175] hover:underline">
          Discover more clubs
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
