<script setup lang="ts">
import type { EventDto } from '~/server/domains/event/dto/event.dto'

useHead({ title: 'Events' })

interface EventsResponse {
  events: EventDto[]
}

// Events are created by clubs, not by players — the create affordance only
// appears in club mode. Switching account mode is how a player gets there.
const { accountMode, activeClubId } = useAccountMode()
const canCreateEvent = computed(() => accountMode.value === 'club')
const createEventLink = computed(() =>
  activeClubId.value ? `/create-event?club=${activeClubId.value}` : '/create-event'
)

// The events endpoint has always accepted province and city filters; only the
// controls were missing. Same read-only use of the picker as community.vue.
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
  selectCity
} = useLocationPicker()

onMounted(() => {
  loadProvinces()
})

/**
 * Status filter — the mockup's "All Status" dropdown (docs/33 §5.7).
 *
 * Sent to the server, not applied in the browser: the events endpoint has
 * always accepted a `status` param and the repository filters on it. Doing it
 * client-side would have quietly filtered only the current page once event
 * counts outgrew the limit.
 *
 * Published and active stay separate rather than folding into one "Open": the
 * mockup draws them as different pills ("Registration Open" vs "Open Play"),
 * and they answer different questions — can I still sign up, versus is it
 * happening right now.
 */
const STATUS_FILTERS: { value: string; label: string; status?: EventDto['status'] }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'published', label: 'Registration open', status: 'published' },
  { value: 'active', label: 'In progress', status: 'active' },
  { value: 'completed', label: 'Completed', status: 'completed' },
  { value: 'cancelled', label: 'Cancelled', status: 'cancelled' },
  { value: 'draft', label: 'Draft', status: 'draft' }
]

const statusFilter = ref('all')

const selectedStatus = computed(
  () => STATUS_FILTERS.find((f) => f.value === statusFilter.value)?.status
)

const statusOptions = computed(() =>
  STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))
)

const { data, pending, error } = await useFetch<EventsResponse>('/api/v1/events', {
  query: computed(() => ({
    province: provinceName.value || undefined,
    city: cityName.value || undefined,
    status: selectedStatus.value
  })),
  watch: [provinceName, cityName, selectedStatus],
  default: () => ({ events: [] as EventDto[] })
})

const visibleEvents = computed(() => data.value?.events ?? [])

const hasLocationFilter = computed(() => !!provinceName.value || !!cityName.value)

function clearLocationFilter() {
  selectProvince('')
}

/**
 * Keyed on the real EventStatus union, so TypeScript fails the build if a status
 * is added and not styled. The previous map had an `in_progress` key that no
 * event can ever have, and no `active` key at all — so every in-progress event
 * rendered with an unstyled pill.
 */
const statusConfig: Record<EventDto['status'], { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-surface-2', text: 'text-fg-muted', label: 'Draft' },
  published: { bg: 'bg-primary/20', text: 'text-primary', label: 'Registration open' },
  active: { bg: 'bg-success/20', text: 'text-success', label: 'In progress' },
  completed: { bg: 'bg-accent/25', text: 'text-on-accent', label: 'Completed' },
  cancelled: { bg: 'bg-danger/15', text: 'text-danger', label: 'Cancelled' }
}

/**
 * Capacity for one event card, or null when there is nothing honest to show.
 *
 * Returns null in two distinct cases that must not be conflated:
 *   - the event declares no `max_participants` — it is uncapped, so there are
 *     no slots to be remaining;
 *   - the count was never fetched (`registered_count` undefined) — which is
 *     different from a count of zero.
 *
 * Withdrawals free their slot, which the server already accounts for by
 * counting only registered/checked-in rows.
 */
function slotsFor(event: EventDto) {
  const total = event.max_participants
  const taken = event.registered_count
  if (total === null || total <= 0 || taken === undefined) return null

  // Clamp: an over-subscribed event (manual additions, a race) should read as
  // full rather than rendering a bar past 100% or a negative remainder.
  const filled = Math.min(taken, total)
  const remaining = Math.max(0, total - taken)
  const percent = Math.round((filled / total) * 100)

  if (remaining === 0) {
    return { label: 'Full', taken: filled, total, remaining, percent, tone: 'text-danger', barTone: 'bg-danger' }
  }
  // Under a quarter left is worth flagging — that is when signing up stops
  // being something a player can put off.
  const scarce = remaining / total <= 0.25
  return {
    label: `${remaining} of ${total} slots left`,
    taken: filled,
    total,
    remaining,
    percent,
    tone: scarce ? 'text-warning' : 'text-fg-secondary',
    barTone: scarce ? 'bg-warning-fill' : 'bg-primary'
  }
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
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <!-- Header -->
      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-fg">Events</h1>
          <p class="mt-1 text-sm text-fg-muted">Tournaments and competitions</p>
        </div>
        <NuxtLink
          v-if="canCreateEvent"
          :to="createEventLink"
          class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create Event
        </NuxtLink>
      </div>

      <!-- Filters: status, then location -->
      <div class="mb-6 flex flex-wrap items-end gap-3">
        <div class="min-w-[10rem]">
          <UiSelect
            v-model="statusFilter"
            label="Status"
            :options="statusOptions"
          />
        </div>
        <div class="min-w-[12rem] flex-1">
          <label for="filter-province" class="mb-1.5 block text-xs text-fg-secondary">Province</label>
          <select
            id="filter-province"
            :value="selectedProvince"
            :disabled="loadingProvinces"
            class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none disabled:opacity-50"
            @change="selectProvince(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ loadingProvinces ? 'Loading…' : 'All provinces' }}</option>
            <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
          </select>
        </div>
        <div class="min-w-[12rem] flex-1">
          <label for="filter-city" class="mb-1.5 block text-xs text-fg-secondary">City</label>
          <select
            id="filter-city"
            :value="selectedCity"
            :disabled="!selectedProvince || loadingCities"
            class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none disabled:opacity-50"
            @change="selectCity(($event.target as HTMLSelectElement).value)"
          >
            <option value="">
              {{ loadingCities ? 'Loading…' : selectedProvince ? 'All cities' : 'Select a province first' }}
            </option>
            <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
          </select>
        </div>
        <button
          v-if="hasLocationFilter"
          type="button"
          class="rounded-lg px-3 py-2 text-sm text-fg-muted hover:text-fg"
          @click="clearLocationFilter"
        >
          Clear
        </button>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="space-y-3">
        <div v-for="i in 4" :key="i" class="h-24 animate-pulse rounded-xl bg-surface" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">Could not load events.</p>
      </div>

      <!-- Empty -->
      <div v-else-if="!data?.events.length" class="rounded-xl bg-surface p-12 text-center">
        <p class="text-4xl">🎪</p>
        <h3 class="mt-4 text-lg font-semibold text-fg">
          {{ hasLocationFilter ? 'No events in this area' : 'No events yet' }}
        </h3>
        <!-- An active filter is the likeliest reason for an empty list, so say
             so before suggesting the user create something. -->
        <p v-if="hasLocationFilter" class="mt-2 text-sm text-fg-muted">
          Try a different province or city, or clear the filter.
        </p>
        <p v-else-if="canCreateEvent" class="mt-2 text-sm text-fg-muted">
          Be the first to create a tournament or competition
        </p>
        <p v-else class="mt-2 text-sm text-fg-muted">
          Events are hosted by clubs. Switch to a club account to create one.
        </p>
        <NuxtLink
          v-if="canCreateEvent"
          :to="createEventLink"
          class="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-on-primary"
        >
          Create Event
        </NuxtLink>
      </div>

      <!-- Nothing matches the status filter, but events do exist -->
      <UiEmptyState
        v-else-if="!visibleEvents.length"
        compact
        icon="filter"
        title="No events with that status"
        message="Try a different status, or clear the filter."
        action-label="Show all"
        @action="statusFilter = 'all'"
      />

      <!-- Image-led cards, per the mobile mockup. The cover is generated from
           the event name — see UiCoverArt for why there is no photo. -->
      <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <NuxtLink
          v-for="event in visibleEvents"
          :key="event.id"
          :to="`/events/${event.id}`"
          class="group overflow-hidden rounded-card border border-border bg-surface transition-colors hover:border-border-strong"
        >
          <UiCoverArt :name="event.name" variant="card" rounded="rounded-none">
            <span
              class="absolute right-2 top-2 rounded-badge px-2 py-0.5 text-caption font-medium"
              :class="[statusConfig[event.status].bg, statusConfig[event.status].text]"
            >
              {{ statusConfig[event.status].label }}
            </span>
          </UiCoverArt>

          <div class="p-4">
            <h2 class="truncate font-medium text-fg">{{ event.name }}</h2>
            <p class="mt-1 flex items-center gap-1.5 text-body-2 text-fg-secondary">
              <UiIcon name="calendar" size="h-4 w-4" class="shrink-0 text-fg-muted" />
              {{ formatDateRange(event.start_date, event.end_date) }}
            </p>
            <p v-if="event.venue || event.city" class="mt-1 flex items-center gap-1.5 text-caption text-fg-muted">
              <UiIcon name="location" size="h-4 w-4" class="shrink-0" />
              <span class="truncate">{{ [event.venue, event.city].filter(Boolean).join(', ') }}</span>
            </p>

            <!-- Capacity. Only rendered when the event declares a limit and the
                 count was actually fetched — an uncapped event has no slots to
                 be remaining, and showing "0 left" for one would be a lie. -->
            <div v-if="slotsFor(event)" class="mt-3">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-caption font-medium" :class="slotsFor(event)!.tone">
                  {{ slotsFor(event)!.label }}
                </span>
                <span class="text-caption tabular-nums text-fg-muted">
                  {{ slotsFor(event)!.taken }}/{{ slotsFor(event)!.total }}
                </span>
              </div>
              <div class="mt-1 h-1.5 overflow-hidden rounded-pill bg-surface-2">
                <div
                  class="h-full rounded-pill transition-[width]"
                  :class="slotsFor(event)!.barTone"
                  :style="{ width: `${slotsFor(event)!.percent}%` }"
                />
              </div>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
