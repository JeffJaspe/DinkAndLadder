<script setup lang="ts">
import type { ClubSearchResultDto } from '~/server/domains/club/dto/club.dto'

useHead({ title: 'Clubs' })

// Clubs are created from a club account. In player mode the affordance is
// hidden — switching account mode (see AccountSwitcher) is the way in, and
// that path offers "Set up a club" when you do not have one yet.
const { accountMode } = useAccountMode()
const canCreateClub = computed(() => accountMode.value === 'club')

const search = ref('')
const province = ref('')

// The endpoint 400s if q/province/city are all empty (deliberately — it's search, not
// a full listing), so don't fetch at all until there's something to search on. Fixes
// two real bugs at once: this page was previously fetching immediately on mount with
// empty params (always erroring before the user typed anything), and reading the
// response as `{ clubs: [...] }` when the endpoint actually returns `{ data: [...] }`.
const { data, pending, error, execute } = await useFetch<{ data: ClubSearchResultDto[] }>(
  '/api/v1/clubs/search',
  {
    query: { q: search, province, limit: 50 },
    immediate: false
  }
)

watch(
  [search, province],
  () => {
    if (search.value || province.value) {
      execute()
    } else {
      data.value = null
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <!-- Header -->
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-fg">Discover Clubs</h1>
        <p class="mt-1 text-sm text-fg-muted">Find your pickleball community</p>
      </div>
      <NuxtLink
        v-if="canCreateClub"
        to="/create-club"
        class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover"
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
          class="w-full rounded-lg border border-border-strong bg-surface py-2.5 pl-10 pr-4 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
        />
        <svg class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <select
        v-model="province"
        class="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-fg focus:border-primary focus:outline-none"
      >
        <option value="">All Provinces</option>
        <option value="Metro Manila">Metro Manila</option>
        <option value="Cebu">Cebu</option>
        <option value="Davao">Davao</option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 6" :key="i" class="h-32 animate-pulse rounded-xl bg-surface" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center">
      <p class="text-red-400">Could not search clubs. Please try again.</p>
    </div>

    <!-- Empty -->
    <div v-else-if="!data?.data.length" class="rounded-xl bg-surface p-12 text-center">
      <p class="text-4xl">🏸</p>
      <h3 class="mt-4 text-lg font-semibold text-fg">
        {{ search ? 'No clubs found' : 'Start searching' }}
      </h3>
      <p class="mt-2 text-sm text-fg-muted">
        {{ search ? `No clubs match '${search}'` : 'Enter a name to find clubs' }}
      </p>
      <NuxtLink v-if="canCreateClub" to="/create-club" class="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-on-primary">
        Create a Club
      </NuxtLink>
    </div>

    <!-- Results -->
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="club in data.data"
        :key="club.id"
        :to="`/clubs/${club.id}`"
        class="rounded-xl bg-surface p-4 transition-all hover:bg-surface-2"
      >
        <div class="flex items-center gap-4">
          <div class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl font-bold text-fg-secondary">
            {{ club.name.charAt(0).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="font-semibold text-fg">{{ club.name }}</h3>
            <p v-if="club.city || club.province" class="mt-0.5 text-sm text-fg-muted">
              {{ [club.city, club.province].filter(Boolean).join(', ') }}
            </p>
            <p class="mt-1 text-xs text-fg-muted">{{ club.member_count }} members</p>
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
