<script setup lang="ts">
import type { ClubSearchResultDto } from '~/server/domains/club/dto/club.dto'

useHead({ title: 'Discover Clubs' })

const route = useRoute()
const router = useRouter()

// Clubs are created from a club account. In player mode the affordance is
// hidden — switching account mode (see AccountSwitcher) is the way in, and
// that path offers "Set up a club" when you do not have one yet.
const { accountMode } = useAccountMode()
const canCreateClub = computed(() => accountMode.value === 'club')

const search = ref('')

/**
 * Verified-only filter.
 *
 * This page absorbed the old standalone /verified-clubs screen, which now
 * redirects to /clubs?verified=1 — hence reading the initial value from the
 * query string rather than defaulting to false unconditionally.
 */
const verifiedOnly = ref(route.query.verified === '1' || route.query.verified === 'true')

// The same cascading PSGC picker the players directory uses. This page
// previously hardcoded three provinces as plain strings ("Metro Manila",
// "Cebu", "Davao"), which could never match the PSGC names actually stored on
// club rows, so those options selected nothing.
const {
  provinces,
  cities,
  selectedProvince,
  selectedCity,
  provinceName,
  cityName,
  loadingProvinces,
  loadingCities,
  loadProvinces,
  selectProvince,
  selectCity,
  reset: resetLocation
} = useLocationPicker()

onMounted(() => {
  loadProvinces()
})

/**
 * No "have you filtered yet" guard.
 *
 * The page used to refuse to fetch until something was typed, and the endpoint
 * used to 400 on an unfiltered call, so "All Provinces" with an empty search
 * box rendered an empty state instead of the directory. Both are gone: empty
 * filters now mean "show me everything", bounded by the limit below.
 */
const { data, pending, error, refresh } = await useFetch<{ data: ClubSearchResultDto[] }>(
  '/api/v1/clubs/search',
  {
    query: computed(() => ({
      q: search.value || undefined,
      province: provinceName.value || undefined,
      city: cityName.value || undefined,
      verified: verifiedOnly.value ? 'true' : undefined,
      limit: 50
    }))
  }
)

// Keep the verified filter in the URL so a filtered directory is a shareable
// link, and so the /verified-clubs redirect survives a page reload.
watch(verifiedOnly, (on) => {
  router.replace({ query: { ...route.query, verified: on ? '1' : undefined } })
})

const clubs = computed(() => data.value?.data ?? [])

const hasFilters = computed(
  () => !!(search.value || provinceName.value || cityName.value || verifiedOnly.value)
)

function clearFilters() {
  search.value = ''
  verifiedOnly.value = false
  resetLocation()
}
</script>

<template>
  <div class="page-shell min-h-screen bg-canvas p-4 lg:p-6">
    <!-- Header -->
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="font-display text-heading-1 text-fg">Discover Clubs</h1>
        <p class="mt-1 text-sm text-fg-muted">Find your pickleball community</p>
      </div>
      <NuxtLink
        v-if="canCreateClub"
        to="/create-club"
        class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover"
      >
        <UiIcon name="plus" size="h-5 w-5" />
        Create Club
      </NuxtLink>
    </div>

    <!-- Search & Filters -->
    <div class="mb-6 space-y-3">
      <div class="relative">
        <input
          v-model="search"
          type="search"
          placeholder="Search clubs..."
          aria-label="Search clubs by name"
          class="w-full rounded-lg border border-border-strong bg-surface py-2.5 pl-10 pr-4 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <UiIcon
          name="search"
          size="h-5 w-5"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
        />
      </div>

      <div class="grid gap-2 sm:grid-cols-3">
        <select
          :value="selectedProvince"
          :disabled="loadingProvinces"
          aria-label="Province"
          class="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          @change="selectProvince(($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ loadingProvinces ? 'Loading...' : 'All Provinces' }}</option>
          <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
        </select>
        <select
          :value="selectedCity"
          :disabled="!selectedProvince || loadingCities"
          aria-label="City"
          class="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          @change="selectCity(($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            {{
              loadingCities
                ? 'Loading...'
                : selectedProvince
                  ? 'All Cities'
                  : 'Pick a province first'
            }}
          </option>
          <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
        </select>

        <!-- A toggle rather than a third dropdown: it is one boolean, and it is
             the filter the old /verified-clubs page existed to express. -->
        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :class="
            verifiedOnly
              ? 'border-primary bg-primary-soft text-primary'
              : 'border-border-strong bg-surface text-fg-secondary hover:bg-surface-2'
          "
          :aria-pressed="verifiedOnly"
          @click="verifiedOnly = !verifiedOnly"
        >
          <UiIcon name="verified" size="h-4 w-4" />
          Verified only
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 6" :key="i" class="h-32 animate-pulse rounded-xl bg-surface" />
    </div>

    <!-- Error -->
    <UiErrorState
      v-else-if="error"
      message="Could not load clubs right now."
      :detail="error.message"
      @retry="refresh()"
    />

    <!-- Empty -->
    <div v-else-if="!clubs.length" class="rounded-xl bg-surface p-12 text-center shadow-card">
      <span
        class="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-surface-2 text-fg-muted"
      >
        <UiIcon name="clubs" size="h-6 w-6" />
      </span>
      <h2 class="mt-4 font-display text-heading-3 text-fg">No clubs found</h2>
      <p class="mt-2 text-sm text-fg-muted">
        {{
          hasFilters
            ? 'No clubs match these filters yet.'
            : 'No clubs have been created on DinkAndLadder yet.'
        }}
      </p>
      <button
        v-if="hasFilters"
        type="button"
        class="mt-4 rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2"
        @click="clearFilters"
      >
        Clear filters
      </button>
      <NuxtLink
        v-else-if="canCreateClub"
        to="/create-club"
        class="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-on-primary"
      >
        Create a Club
      </NuxtLink>
    </div>

    <!-- Results -->
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="club in clubs"
        :key="club.id"
        :to="`/clubs/${club.id}`"
        class="rounded-xl bg-surface p-4 shadow-card transition-all hover:bg-surface-2 hover:shadow-card-hover"
      >
        <div class="flex items-center gap-4">
          <!-- Club search results carry no image paths (ClubSearchResultDto),
               so the directory always shows the platform mark. -->
          <UiClubLogo :name="club.name" box-class="h-14 w-14 rounded-xl" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <h2 class="truncate text-body-1 font-medium text-fg">{{ club.name }}</h2>
              <VerifiedBadge
                v-if="club.verification_status === 'verified'"
                size="sm"
                class="shrink-0"
              />
            </div>
            <p v-if="club.city || club.province" class="mt-0.5 text-sm text-fg-muted">
              {{ [club.city, club.province].filter(Boolean).join(', ') }}
            </p>
            <p class="mt-1 text-caption text-fg-muted">
              <span class="tabular-nums">{{ club.member_count ?? 0 }}</span>
              {{ club.member_count === 1 ? 'member' : 'members' }}
            </p>
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
