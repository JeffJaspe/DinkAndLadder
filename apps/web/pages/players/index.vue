<script setup lang="ts">
import type { PlayerSearchResultDto } from '~/server/domains/player/dto/player-profile.dto'

useHead({ title: 'Players' })

const search = ref('')

const {
  provinces,
  cities,
  barangays,
  selectedProvince,
  selectedCity,
  selectedBarangay,
  provinceName,
  cityName,
  barangayName,
  loadingProvinces,
  loadingCities,
  loadingBarangays,
  loadProvinces,
  selectProvince,
  selectCity,
  selectBarangay,
  reset: resetLocation
} = useLocationPicker()

onMounted(() => {
  loadProvinces()
})

/**
 * No "have you searched yet" gate.
 *
 * The page used to hold the request until a filter was set, and the endpoint
 * used to 400 on an unfiltered call, so selecting "All Provinces" with an empty
 * search box cleared the list and showed "Start searching" — the opposite of
 * what that option says. Empty filters now mean every public profile, bounded
 * by the limit below.
 */
const { data, pending, error, refresh } = await useFetch<{ data: PlayerSearchResultDto[] }>(
  '/api/v1/players/search',
  {
    query: computed(() => ({
      q: search.value || undefined,
      province: provinceName.value || undefined,
      city: cityName.value || undefined,
      barangay: barangayName.value || undefined,
      limit: 50
    }))
  }
)

const players = computed(() => data.value?.data ?? [])

/** Only used to word the empty state — never to decide whether to fetch. */
const hasSearchCriteria = computed(
  () => !!(search.value || provinceName.value || cityName.value || barangayName.value)
)

function clearFilters() {
  search.value = ''
  resetLocation()
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-fg">Find Players</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Search for players to follow, challenge, or connect with
      </p>
    </div>

    <!-- Search & Filters -->
    <div class="mb-6 space-y-3">
      <div class="relative">
        <input
          v-model="search"
          type="search"
          placeholder="Search by name..."
          class="w-full rounded-lg border border-border-strong bg-surface py-2.5 pl-10 pr-4 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
        />
        <svg
          class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <div class="grid gap-2 sm:grid-cols-3">
        <select
          :value="selectedProvince"
          :disabled="loadingProvinces"
          class="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-fg focus:border-primary focus:outline-none disabled:opacity-50"
          @change="selectProvince(($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ loadingProvinces ? 'Loading...' : 'All Provinces' }}</option>
          <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
        </select>
        <select
          :value="selectedCity"
          :disabled="!selectedProvince || loadingCities"
          class="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-fg focus:border-primary focus:outline-none disabled:opacity-50"
          @change="selectCity(($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            {{ loadingCities ? 'Loading...' : selectedProvince ? 'All Cities' : 'Select province' }}
          </option>
          <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
        </select>
        <select
          :value="selectedBarangay"
          :disabled="!selectedCity || loadingBarangays"
          class="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-fg focus:border-primary focus:outline-none disabled:opacity-50"
          @change="selectBarangay(($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            {{ loadingBarangays ? 'Loading...' : selectedCity ? 'All Barangays' : 'Select city' }}
          </option>
          <option v-for="b in barangays" :key="b.code" :value="b.code">{{ b.name }}</option>
        </select>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 6" :key="i" class="h-24 animate-pulse rounded-xl bg-surface" />
    </div>

    <!-- Error -->
    <UiErrorState
      v-else-if="error"
      message="Could not load players right now."
      :detail="error.message"
      @retry="refresh()"
    />

    <!-- Empty -->
    <div v-else-if="!players.length" class="rounded-xl bg-surface p-12 text-center shadow-card">
      <p class="text-4xl">👥</p>
      <h3 class="mt-4 text-lg font-semibold text-fg">No players found</h3>
      <p class="mt-2 text-sm text-fg-muted">
        {{
          hasSearchCriteria
            ? 'No players match your search criteria'
            : 'No public player profiles exist yet.'
        }}
      </p>
      <button
        v-if="hasSearchCriteria"
        type="button"
        class="mt-4 rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2"
        @click="clearFilters"
      >
        Clear filters
      </button>
    </div>

    <!-- Results -->
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="player in players"
        :key="player.id"
        :to="`/players/${player.id}`"
        class="flex items-center gap-4 rounded-xl bg-surface p-4 transition-all hover:bg-surface-2 shadow-card hover:shadow-card-hover"
      >
        <div
          class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-fg-secondary"
        >
          {{ player.display_name.charAt(0).toUpperCase() }}
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="font-semibold text-fg">{{ player.display_name }}</h3>
          <p v-if="player.city || player.province" class="text-sm text-fg-muted">
            {{ [player.city, player.province].filter(Boolean).join(', ') }}
          </p>
        </div>
        <div v-if="player.singles_rating" class="text-right">
          <p class="text-lg font-bold text-primary">{{ Math.round(player.singles_rating) }}</p>
          <p class="text-xs text-fg-muted">Rating</p>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
