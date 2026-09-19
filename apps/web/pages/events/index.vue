<script setup lang="ts">
import type { EventDto } from '~/server/domains/event/dto/event.dto'
import { isClubAdminRole, isClubStaffRole } from '~/utils/club-roles'
import type { EventKindFilter } from '~/utils/event-type'
import type { MyClubMembershipDto } from '~/server/domains/club/dto/club-membership.dto'

useHead({ title: 'Events' })

interface EventsResponse {
  events: EventDto[]
}

const route = useRoute()
const router = useRouter()

// Events are created by clubs, not by players — the create affordance only
// appears in club mode. Switching account mode is how a player gets there.
const { isClubMode, activeClubId } = useAccountMode()
/**
 * Creating an event is an owner's or admin's action (event.service refuses a
 * moderator with NOT_CLUB_ADMIN). Club mode alone used to show the button to
 * everyone in it, so a moderator got a Create Event that failed on submit.
 */
const canCreateEvent = computed(
  () =>
    isClubMode.value &&
    (myClubsData.value?.items ?? []).some(
      (m) => m.club.id === resolvedClubId.value && m.status === 'active' && isClubAdminRole(m.role)
    )
)
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

/**
 * Restore a location filter that came in on the URL.
 *
 * Sequenced rather than fired together: the city list does not exist until its
 * province has been chosen, so selecting a city before its province loads would
 * silently drop it. Both selects hold PSGC codes; the request sends the names
 * these resolve to, which is why the codes are what the URL carries.
 */
onMounted(async () => {
  await loadProvinces()

  const province = route.query.province
  if (typeof province !== 'string' || !province) return
  await selectProvince(province)

  const city = route.query.city
  if (typeof city === 'string' && city) await selectCity(city)
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

/**
 * The filters live in the URL.
 *
 * That is what makes them survive opening an event and coming back: the browser
 * restores `/events?status=active&type=tournament`, and this page reads its
 * state from there rather than from memory that a route change throws away.
 * It also means a filtered list can be linked to and reloaded.
 *
 * The same mechanism gives the other half of the behaviour for free — the nav
 * link points at a bare `/events`, so arriving that way is an unfiltered list
 * even when the previous visit was filtered. `router.replace` (never `push`)
 * keeps every one of those edits out of the history stack, so Back leaves the
 * page instead of walking backwards through the filters that got you here.
 */
/** A query param, only when it is one of the values this page understands. */
function queryValue(key: string, allowed: string[]): string | null {
  const raw = route.query[key]
  return typeof raw === 'string' && allowed.includes(raw) ? raw : null
}

const statusFilter = ref(
  queryValue(
    'status',
    STATUS_FILTERS.map((f) => f.value)
  ) ?? 'all'
)

// Broad kind filter — Open Play vs Tournament. Sent to the server for the same
// reason status is: filtering in the browser would only ever filter the page
// that happened to load.
const kindFilter = ref<EventKindFilter>(
  (queryValue(
    'type',
    EVENT_KIND_FILTERS.map((f) => f.value)
  ) as EventKindFilter | null) ?? 'all'
)
const selectedEventTypes = computed(() => eventTypesForFilter(kindFilter.value))

const selectedStatus = computed(
  () => STATUS_FILTERS.find((f) => f.value === statusFilter.value)?.status
)

// Draft is club-mode work, so player mode is not offered it as a filter — and
// if the mode is switched while "Draft" is selected, the filter falls back to
// "All Status" rather than leaving the select showing an option it no longer has.
const statusOptions = computed(() =>
  STATUS_FILTERS.filter((f) => f.value !== 'draft' || isClubMode.value).map((f) => ({
    value: f.value,
    label: f.label
  }))
)

watch(isClubMode, (clubMode) => {
  if (!clubMode && statusFilter.value === 'draft') statusFilter.value = 'all'
})

/**
 * A keyword, matched server-side against name, venue and town.
 *
 * Debounced because it re-queries as you type, and 250ms is about the gap
 * between words — long enough that a whole word is usually one request, short
 * enough that the list feels like it is following along.
 */
const initialSearch = typeof route.query.q === 'string' ? route.query.q.slice(0, 100) : ''
const searchTerm = ref(initialSearch)
const debouncedSearch = ref(initialSearch)
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(searchTerm, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedSearch.value = value.trim()
  }, 250)
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

/**
 * Acting as a club, this page is the club's own events and nothing else.
 *
 * It was the whole public listing in both modes, so a club looking at "Events"
 * saw every other club's sessions and had to find its own among them. Location
 * filters go with it: every event here belongs to one club in one town, so
 * filtering by province is a control that can only ever remove rows.
 *
 * The scope has to survive a club mode with no club chosen. `active_club_id` is
 * a cookie, so it can be absent while `account_mode` still says club — cleared
 * site data, a session cookie that expired on its own, a mode set before the id
 * existed — and the old `activeClubId || undefined` turned that into an
 * unscoped query, which is the whole public listing: a club looking at Events
 * saw five other clubs' sessions. The clubs the account actually administers
 * are the fallback, and the choice is written back so the rest of the app
 * (Create Event, the club dashboard link) agrees with this page.
 */
const { data: myClubsData } = await useFetch<{ items: MyClubMembershipDto[] }>(
  '/api/v1/clubs/mine',
  {
    ignoreResponseError: true,
    default: () => ({ items: [] as MyClubMembershipDto[] })
  }
)

const adminClubIds = computed(() =>
  (myClubsData.value?.items ?? [])
    .filter((m) => m.status === 'active' && isClubStaffRole(m.role))
    .map((m) => m.club.id)
)

const { switchToClub } = useAccountMode()

const resolvedClubId = computed(() => {
  if (!isClubMode.value) return undefined
  if (activeClubId.value) return activeClubId.value
  return adminClubIds.value[0]
})

watch(
  resolvedClubId,
  (id) => {
    if (id && !activeClubId.value) switchToClub(id)
  },
  { immediate: true }
)
const clubScopeId = computed(() =>
  isClubMode.value ? resolvedClubId.value || undefined : undefined
)

const { data, pending, error } = await useFetch<EventsResponse>('/api/v1/events', {
  query: computed(() => ({
    club_id: clubScopeId.value,
    province: isClubMode.value ? undefined : provinceName.value || undefined,
    city: isClubMode.value ? undefined : cityName.value || undefined,
    q: debouncedSearch.value || undefined,
    status: selectedStatus.value,
    event_types: selectedEventTypes.value?.join(',')
  })),
  watch: [
    clubScopeId,
    provinceName,
    cityName,
    debouncedSearch,
    selectedStatus,
    selectedEventTypes,
    isClubMode
  ],
  default: () => ({ events: [] as EventDto[] })
})

// Defence in depth, not the only guard. The endpoint already withholds other
// people's drafts, but an organiser's own drafts come back on this list, and in
// player mode they should not be on screen at all.
const visibleEvents = computed(() => {
  const events = data.value?.events ?? []
  if (!isClubMode.value) return events.filter((e) => e.status !== 'draft')
  // Club mode is the club's own events or nothing: with no club resolved there
  // is no "own" to show, and a public listing is the wrong answer to it.
  if (!resolvedClubId.value) return []
  return events.filter((e) => e.club_id === resolvedClubId.value)
})

const hasLocationFilter = computed(
  () => !isClubMode.value && (!!provinceName.value || !!cityName.value)
)

/**
 * Whether anything is narrowing the list.
 *
 * The empty state used to blame location only, so a search that found nothing
 * read as "No events yet" — which is a different and much more discouraging
 * claim than "nothing matched what you typed".
 */
const hasAnyFilter = computed(
  () =>
    hasLocationFilter.value ||
    !!debouncedSearch.value ||
    statusFilter.value !== 'all' ||
    kindFilter.value !== 'all'
)

/** Club mode with no club behind it: the fix is to pick one, not to filter. */
const clubModeWithoutClub = computed(() => isClubMode.value && !resolvedClubId.value)

const emptyTitle = computed(() => {
  if (clubModeWithoutClub.value) return 'Pick which club you are running'
  if (debouncedSearch.value) return 'Nothing matched that search'
  if (hasLocationFilter.value) return 'No events in this area'
  if (hasAnyFilter.value) return 'No events with those filters'
  return isClubMode.value ? 'This club has no events yet' : 'No events yet'
})

const emptyHint = computed(() => {
  if (clubModeWithoutClub.value)
    return 'Choose a club in the account switcher, or switch to your player account to browse public events.'
  if (debouncedSearch.value) return 'Try a shorter keyword, or clear the search.'
  if (hasLocationFilter.value) return 'Try a different province or city, or clear the filter.'
  return 'Try a different status or type, or clear the filters.'
})

function clearFilters() {
  searchTerm.value = ''
  debouncedSearch.value = ''
  statusFilter.value = 'all'
  kindFilter.value = 'all'
  selectProvince('')
}

/**
 * Filter state out to the URL, and back again.
 *
 * Written with `replace` so the address bar tracks the list without every
 * keystroke becoming a history entry to walk back through. Only non-default
 * values are written, which is what keeps the nav link's bare `/events` and a
 * fully-cleared list at the same address.
 */
watch(
  [debouncedSearch, statusFilter, kindFilter, selectedProvince, selectedCity],
  ([q, status, kind, province, city]) => {
    const query: Record<string, string> = {}
    if (q) query.q = q
    if (status !== 'all') query.status = status
    if (kind !== 'all') query.type = kind
    if (province) query.province = province
    if (city) query.city = city

    const current = route.query
    const same =
      Object.keys(query).length === Object.keys(current).length &&
      Object.entries(query).every(([key, value]) => current[key] === value)
    if (!same) router.replace({ query })
  }
)

/**
 * Arriving at the bare `/events` clears the filters.
 *
 * Vue Router keeps this component mounted when only the query changes, so
 * pressing the nav link while already on a filtered list changes the URL and
 * nothing else. This is what makes the two rules hold together: Back restores
 * what you had, the nav link starts fresh.
 */
watch(
  () => route.query,
  (query) => {
    if (Object.keys(query).length === 0 && hasAnyFilter.value) clearFilters()
  }
)

/**
 * Keyed on the real EventStatus union, so TypeScript fails the build if a status
 * is added and not styled. The previous map had an `in_progress` key that no
 * event can ever have, and no `active` key at all — so every in-progress event
 * rendered with an unstyled pill.
 *
 * The pill carries a solid surface fill and a coloured dot rather than a
 * translucent wash of its own colour. Two reasons: the wash sat on a header
 * that is now tinted per event type, so a green-on-green "In progress" faded
 * into the card behind it; and `published` and `active` were both green, which
 * made "you can still sign up" and "it is happening now" — the two states a
 * browser most needs to tell apart — look like the same badge. Each status now
 * owns a hue: green open, blue running, grey finished, red cancelled.
 */
const statusConfig: Record<EventDto['status'], { dot: string; text: string; label: string }> = {
  draft: { dot: 'bg-fg-muted', text: 'text-fg-muted', label: 'Draft' },
  published: { dot: 'bg-primary', text: 'text-primary', label: 'Registration open' },
  active: { dot: 'bg-info', text: 'text-info', label: 'In progress' },
  completed: { dot: 'bg-rating-silver', text: 'text-rating-silver', label: 'Completed' },
  cancelled: { dot: 'bg-danger', text: 'text-danger', label: 'Cancelled' }
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
    return {
      label: 'Full',
      taken: filled,
      total,
      remaining,
      percent,
      tone: 'text-danger',
      barTone: 'bg-danger'
    }
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
  const endStr = endDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
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
          <h1 class="font-display text-heading-1 text-fg">Events</h1>
          <p class="mt-1 text-sm text-fg-muted">Open play, tournaments and coaching near you</p>
        </div>
        <NuxtLink
          v-if="canCreateEvent"
          :to="createEventLink"
          class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Event
        </NuxtLink>
      </div>

      <!-- Filters: search, status, type, then location.
           Search leads: it is the one control that answers "where is the event
           I already have in mind", which is most of what brings someone here.
           Location is player-mode only — in club mode every event on this page
           belongs to one club in one town, so a province picker could only ever
           remove rows. -->
      <div class="mb-6 flex flex-wrap items-end gap-3">
        <div class="min-w-[14rem] flex-1">
          <label for="filter-search" class="mb-1.5 block text-xs text-fg-secondary">Search</label>
          <div class="relative">
            <UiIcon
              name="search"
              size="h-4 w-4"
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
            />
            <input
              id="filter-search"
              v-model="searchTerm"
              type="search"
              placeholder="Name, venue or town"
              class="min-h-11 w-full rounded-lg border border-border-strong bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
        <div class="min-w-[10rem]">
          <UiSelect v-model="statusFilter" label="Status" :options="statusOptions" />
        </div>
        <div class="min-w-[10rem]">
          <UiSelect v-model="kindFilter" label="Type" :options="EVENT_KIND_FILTERS" />
        </div>
        <div v-if="!isClubMode" class="min-w-[12rem] flex-1">
          <label for="filter-province" class="mb-1.5 block text-xs text-fg-secondary"
            >Province</label
          >
          <select
            id="filter-province"
            :value="selectedProvince"
            :disabled="loadingProvinces"
            class="min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            @change="selectProvince(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ loadingProvinces ? 'Loading…' : 'All provinces' }}</option>
            <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
          </select>
        </div>
        <div v-if="!isClubMode" class="min-w-[12rem] flex-1">
          <label for="filter-city" class="mb-1.5 block text-xs text-fg-secondary">City</label>
          <select
            id="filter-city"
            :value="selectedCity"
            :disabled="!selectedProvince || loadingCities"
            class="min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            @change="selectCity(($event.target as HTMLSelectElement).value)"
          >
            <option value="">
              {{
                loadingCities
                  ? 'Loading…'
                  : selectedProvince
                    ? 'All cities'
                    : 'Select a province first'
              }}
            </option>
            <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
          </select>
        </div>
        <button
          v-if="hasAnyFilter"
          type="button"
          class="min-h-11 rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          @click="clearFilters"
        >
          Clear
        </button>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="space-y-3">
        <div v-for="i in 4" :key="i" class="h-24 animate-pulse rounded-xl bg-surface" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="rounded-xl bg-danger-soft p-6 text-center">
        <p class="text-danger">Could not load events.</p>
      </div>

      <!-- Empty -->
      <div
        v-else-if="!visibleEvents.length"
        class="rounded-xl bg-surface p-12 text-center shadow-card"
      >
        <span
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-surface-2 text-fg-muted"
        >
          <UiIcon name="calendar" size="h-6 w-6" />
        </span>
        <h3 class="mt-4 font-display text-heading-3 text-fg">
          {{ emptyTitle }}
        </h3>
        <!-- An active filter is the likeliest reason for an empty list, so say
             so before suggesting the user create something. -->
        <p v-if="clubModeWithoutClub || hasAnyFilter" class="mt-2 text-sm text-fg-muted">
          {{ emptyHint }}
        </p>
        <p v-else-if="canCreateEvent" class="mt-2 text-sm text-fg-muted">
          Be the first to put an open play session or a tournament on the calendar
        </p>
        <p v-else class="mt-2 text-sm text-fg-muted">
          Open play and tournaments are hosted by clubs. Switch to a club account to create one.
        </p>
        <NuxtLink
          v-if="canCreateEvent"
          :to="createEventLink"
          class="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-on-primary"
        >
          Create Event
        </NuxtLink>
      </div>

      <!-- Cards in three bands: the artwork panel saying what kind of event
           this is and whose it is, the practical detail under it, and capacity
           along the foot.

           The artwork comes from `event_type` rather than a hash of the name
           (which is what UiCoverArt does, and why it is no longer used here):
           a tournament should look like a tournament on every card, and the
           five sessions one club runs should be tellable apart at a glance
           rather than looking like five unrelated products. -->
      <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <NuxtLink
          v-for="event in visibleEvents"
          :key="event.id"
          :to="`/events/${event.id}`"
          class="group flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card transition-shadow hover:shadow-card-hover"
        >
          <!-- The artwork panel: the illustration for this kind of event, the
               ribbon naming it, the host club in the band the drawing leaves
               clear, and status in the halftone corner.

               The event's own name sits below the artwork rather than on it.
               It is the longest and most important string on the card, and the
               one thing that must never fight the illustration for room. -->
          <EventTypeArtwork :event-type="event.event_type">
            <template #status>
              <span
                class="inline-flex items-center gap-1.5 rounded-badge bg-surface px-2 py-0.5 text-caption font-semibold shadow-card ring-1 ring-inset ring-border"
                :class="statusConfig[event.status].text"
              >
                <span
                  class="h-1.5 w-1.5 shrink-0 rounded-full"
                  :class="statusConfig[event.status].dot"
                />
                {{ statusConfig[event.status].label }}
              </span>
              <!-- Only rendered when the server knew who was asking:
                   viewer_registered is undefined for a signed-out visitor, and
                   a missing badge must not read as "you are not signed up". -->
              <span
                v-if="event.viewer_registered"
                class="inline-flex items-center gap-1 rounded-badge bg-surface px-2 py-0.5 text-caption font-semibold text-success shadow-card ring-1 ring-inset ring-border"
              >
                <UiIcon name="check" size="h-3.5 w-3.5" :stroke-width="2.5" />
                Registered
              </span>
            </template>

            <!-- Who is hosting. Every event belongs to a club, but the card
                 only ever showed the venue and the town, so "whose session is
                 this" was unanswerable without opening it. Omitted rather than
                 blanked when the club could not be resolved.

                 On its own plate, closed by a hairline ring, for the reason the
                 status chips above it are: the drawing behind this row is not
                 reliably light, and at its darkest the club name was measuring
                 1.04:1 against it. The plate is `surface`, so the name is drawn
                 in the theme's own ink at the contrast it has everywhere else
                 rather than in a fixed dark `on-art` that only ever suited a
                 pale background. -->
            <div
              v-if="event.club_name"
              class="inline-flex max-w-full items-center gap-2.5 rounded-badge bg-surface py-1.5 pl-1.5 pr-3 shadow-card ring-1 ring-inset ring-border"
            >
              <UiAvatar :name="event.club_name" size="sm" class="shrink-0" />
              <span class="min-w-0">
                <span class="flex items-center gap-1">
                  <span class="truncate text-body-2 font-medium text-fg">
                    {{ event.club_name }}
                  </span>
                  <!-- Same claim as the club page's VerifiedBadge, reduced to
                       its mark: the word would not fit beside a club name and
                       the tick is what people actually read. -->
                  <span
                    v-if="event.club_verified"
                    class="flex shrink-0 items-center"
                    title="This club is verified by DinkAndLadder"
                  >
                    <UiIcon
                      name="verified"
                      size="h-4 w-4"
                      class="text-info"
                      :stroke-width="2"
                      label="Verified club"
                    />
                  </span>
                </span>
                <span class="block text-caption text-fg-muted">Host club</span>
              </span>
            </div>
          </EventTypeArtwork>

          <div class="flex flex-1 flex-col p-4">
            <h2 class="mb-2 line-clamp-2 font-display text-heading-3 leading-tight text-fg">
              {{ event.name }}
            </h2>
            <p class="flex items-center gap-1.5 text-body-2 text-fg-secondary">
              <UiIcon name="calendar" size="h-4 w-4" class="shrink-0 text-fg-muted" />
              {{ formatDateRange(event.start_date, event.end_date) }}
            </p>
            <p
              v-if="formatEventTimeRange(event.start_time, event.end_time)"
              class="mt-1.5 flex items-center gap-1.5 text-caption text-fg-muted"
            >
              <UiIcon name="clock" size="h-4 w-4" class="shrink-0" />
              {{ formatEventTimeRange(event.start_time, event.end_time) }}
            </p>
            <p
              v-if="event.venue || event.city"
              class="mt-1.5 flex items-center gap-1.5 text-caption text-fg-muted"
            >
              <UiIcon name="location" size="h-4 w-4" class="shrink-0" />
              <span class="truncate">{{
                [event.venue, event.city].filter(Boolean).join(', ')
              }}</span>
            </p>

            <!-- Capacity, on its own band under a rule so it reads as the
                 card's footing rather than a fourth detail line. Only rendered
                 when the event declares a limit and the count was actually
                 fetched — an uncapped event has no slots to be remaining, and
                 showing "0 left" for one would be a lie. -->
            <div
              v-if="slotsFor(event)"
              class="mt-4 flex items-center gap-3 border-t border-border pt-3"
            >
              <UiIcon name="players" size="h-4 w-4" class="shrink-0 text-fg-muted" />
              <span class="shrink-0">
                <span class="block text-caption font-semibold" :class="slotsFor(event)!.tone">
                  {{
                    slotsFor(event)!.remaining
                      ? `${slotsFor(event)!.remaining} of ${slotsFor(event)!.total}`
                      : 'Full'
                  }}
                </span>
                <span v-if="slotsFor(event)!.remaining" class="block text-caption text-fg-muted">
                  slots left
                </span>
              </span>
              <span class="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-2">
                <span
                  class="block h-full rounded-pill transition-[width]"
                  :class="slotsFor(event)!.barTone"
                  :style="{ width: `${slotsFor(event)!.percent}%` }"
                />
              </span>
              <span class="shrink-0 text-right">
                <span class="block text-caption font-semibold tabular-nums text-fg">
                  {{ slotsFor(event)!.taken }}/{{ slotsFor(event)!.total }}
                </span>
                <span class="block text-caption text-fg-muted">registered</span>
              </span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
