<script setup lang="ts">
interface ClubSearchResult {
  id: string
  name: string
  logo_url?: string
  province?: string
  city?: string
  member_count: number
  visibility: 'public' | 'private'
}

const search = ref('')
const province = ref('')

const { data, pending, error } = await useFetch<{ clubs: ClubSearchResult[] }>('/api/v1/clubs/search', {
  query: { q: search, province, limit: 50 },
  watch: [search, province]
})
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <!-- Header -->
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Discover Clubs</h1>
        <p class="mt-1 text-sm text-[#6B7B75]">Find your pickleball community</p>
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

    <!-- Search & Filters -->
    <div class="mb-6 flex flex-col gap-3 sm:flex-row">
      <div class="relative flex-1">
        <input
          v-model="search"
          type="search"
          placeholder="Search clubs..."
          class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] py-2.5 pl-10 pr-4 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
        />
        <svg class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6B7B75]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <select
        v-model="province"
        class="rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-4 py-2.5 text-white focus:border-[#4DB175] focus:outline-none"
      >
        <option value="">All Provinces</option>
        <option value="Metro Manila">Metro Manila</option>
        <option value="Cebu">Cebu</option>
        <option value="Davao">Davao</option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 6" :key="i" class="h-32 animate-pulse rounded-xl bg-[#1E2E2A]" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center">
      <p class="text-red-400">Could not search clubs. Please try again.</p>
    </div>

    <!-- Empty -->
    <div v-else-if="!data?.clubs.length" class="rounded-xl bg-[#1E2E2A] p-12 text-center">
      <p class="text-4xl">🏸</p>
      <h3 class="mt-4 text-lg font-semibold text-white">
        {{ search ? 'No clubs found' : 'Start searching' }}
      </h3>
      <p class="mt-2 text-sm text-[#6B7B75]">
        {{ search ? `No clubs match '${search}'` : 'Enter a name to find clubs' }}
      </p>
      <NuxtLink to="/create-club" class="mt-4 inline-block rounded-lg bg-[#4DB175] px-4 py-2 text-white">
        Create a Club
      </NuxtLink>
    </div>

    <!-- Results -->
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="club in data.clubs"
        :key="club.id"
        :to="`/clubs/${club.id}`"
        class="rounded-xl bg-[#1E2E2A] p-4 transition-all hover:bg-[#2E4540]"
      >
        <div class="flex items-center gap-4">
          <div class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-[#2E4540] text-xl font-bold text-[#A6ABA7]">
            {{ club.name.charAt(0).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="font-semibold text-white">{{ club.name }}</h3>
            <p v-if="club.city || club.province" class="mt-0.5 text-sm text-[#6B7B75]">
              {{ [club.city, club.province].filter(Boolean).join(', ') }}
            </p>
            <p class="mt-1 text-xs text-[#6B7B75]">{{ club.member_count }} members</p>
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
