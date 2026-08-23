<script setup lang="ts">
/**
 * Rankings — Phase 5 of docs/33 (§5.3).
 *
 * Three things were wrong before this pass, all of which the mockup implies but
 * the page did not deliver:
 *
 * 1. The Trend column rendered `Math.floor(Math.random() * 20)` — literally a
 *    fresh random number on every render. It now shows the player's real net
 *    rating change over the last 7 days, from `rating_transactions`.
 * 2. Pagination was seven hardcoded buttons ("1 2 3 … 25") that did nothing,
 *    on a ladder with five players. It is now driven by `meta.total`.
 * 3. Ratings rendered as `Math.round(rating_value)`, so a 4.250 and a 3.500
 *    both showed as "4" and "3". Ratings are `numeric(5,3)`; three decimals is
 *    the stored precision and the only format that distinguishes players.
 *
 * Search is server-side (`q` on the endpoint, `ilike` in SQL) so it matches
 * across the whole ladder. Filtering in the browser only ever saw the loaded
 * page, so looking for a player ranked 200th silently found nothing.
 *
 * The podium's visual treatment — plinths on a shared baseline, tier trophies,
 * a raised centre — follows a reference design the user supplied. Its data did
 * not come with it: that design shows prize pools, a countdown and a rewards
 * column, none of which exist here, so the plinths carry rating, tier, matches
 * and movement instead.
 */
import type { RankingEntryDto } from '~/server/domains/rating/dto/ranking.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import { formatRating } from '~/utils/rating-tiers'

useHead({ title: 'Rankings' })

const PAGE_SIZE = 50

const route = useRoute()
const router = useRouter()

const ratingType = ref<'singles' | 'doubles'>(
  route.query.type === 'doubles' ? 'doubles' : 'singles'
)
const province = ref(typeof route.query.province === 'string' ? route.query.province : '')
const searchQuery = ref('')

/**
 * Debounced copy of the search box, sent to the API.
 *
 * Search used to filter `entries` in the browser, which only ever saw the
 * loaded page — searching for a player ranked 200th silently found nothing.
 * The endpoint now takes a `q` param and matches in SQL across the whole
 * ladder. Debounced so typing does not fire a request per keystroke.
 */
const debouncedSearch = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(searchQuery, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedSearch.value = value.trim()
    page.value = 1
  }, 300)
})

onBeforeUnmount(() => clearTimeout(searchTimer))
const page = ref(Math.max(1, Number(route.query.page) || 1))

const { provinces, loadingProvinces, loadProvinces } = useLocationPicker()
onMounted(loadProvinces)

// Filters are URL-backed so a filtered ranking is a shareable link.
watch([ratingType, province, page], () => {
  router.replace({
    query: {
      ...route.query,
      type: ratingType.value,
      province: province.value || undefined,
      page: page.value > 1 ? String(page.value) : undefined
    }
  })
})

// Changing a filter must reset paging, or you land on page 4 of a 1-page list.
watch([ratingType, province], () => {
  page.value = 1
})

const offset = computed(() => (page.value - 1) * PAGE_SIZE)

const {
  data: response,
  pending,
  error,
  refresh
} = await useFetch<{
  data: RankingEntryDto[]
  meta: { total: number; limit: number; offset: number }
}>('/api/v1/rankings', {
  query: { rating_type: ratingType, province, q: debouncedSearch, limit: PAGE_SIZE, offset },
  watch: [ratingType, province, debouncedSearch, offset]
})

// "Where am I?" is the first question anyone asks on a rankings page.
const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me', {
  server: false
})

const entries = computed(() => response.value?.data ?? [])
const total = computed(() => response.value?.meta?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

/** The podium only makes sense on page one of an unsearched list. */
const showPodium = computed(() => page.value === 1 && !debouncedSearch.value)

/**
 * Compact page list: first, last, and a window around the current page. The old
 * markup hardcoded "1 2 3 … 25" regardless of how many pages existed.
 */
const pageNumbers = computed(() => {
  const last = totalPages.value
  const current = page.value
  const pages = new Set([1, last, current, current - 1, current + 1])
  return [...pages].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b)
})

const provinceOptions = computed(() => [
  { value: '', label: loadingProvinces.value ? 'Loading…' : 'All Provinces' },
  ...provinces.value.map((p) => ({ value: p.name, label: p.name }))
])

/** Where the reader sits, for the standing callout under the podium. */
const myEntry = computed(
  () => entries.value.find((e) => e.player_id === myProfile.value?.id) ?? null
)

function openPlayer(entry: { player_id: string }) {
  return navigateTo(`/players/${entry.player_id}`)
}
</script>

<template>
  <div class="page-shell relative px-4 py-6 lg:px-6">
    <header class="relative z-10 mb-6 text-center sm:text-left">
      <h1 class="font-display text-heading-1 text-fg">Rankings</h1>
      <p class="mt-1 text-body-2 text-fg-secondary">
        The official rankings of pickleball players in the Philippines.
      </p>
    </header>

    <div class="relative z-10 mb-6 flex flex-wrap items-end gap-3">
      <UiSegmented
        v-model="ratingType"
        label="Rating type"
        :items="[
          { value: 'singles', label: 'Singles' },
          { value: 'doubles', label: 'Doubles' }
        ]"
      />
      <UiSelect v-model="province" aria-label="Province" :options="provinceOptions" />
      <div class="min-w-[12rem] flex-1 lg:max-w-xs">
        <UiInput
          v-model="searchQuery"
          label="Search players"
          hide-label
          type="search"
          icon="search"
          placeholder="Search players…"
        />
      </div>
    </div>

    <UiErrorState
      v-if="error"
      message="Could not load the rankings right now."
      :detail="error.message"
      @retry="refresh()"
    />

    <template v-else>
      <h2 v-if="showPodium" class="mb-6 text-center font-display text-heading-3 text-fg">
        Top 3 {{ ratingType === 'singles' ? 'Singles' : 'Doubles' }}
        <span class="text-fg-secondary">· {{ province || 'Nationwide' }}</span>
      </h2>

      <RankingBoard
        :entries="entries"
        :show-podium="showPodium"
        :highlight-id="myProfile?.id ?? null"
        :loading="pending"
        @select="openPlayer"
      >
        <template #empty>
          <UiEmptyState
            v-if="debouncedSearch"
            compact
            icon="search"
            title="No players match that search"
            :message="`No player matches “${debouncedSearch}”.`"
          />
          <UiEmptyState
            v-else
            compact
            icon="trophy"
            title="No ranked players yet"
            message="Ratings appear here once matches have been played and verified."
            action-label="Submit a match"
            action-to="/matches/submit"
          />
        </template>

        <template #below-podium>
          <!-- Standing callout, in the spirit of the reference's "you ranked N of
               M users" pill — but built only from facts we hold: the reader's own
               rank, the real total, and their movement. Hidden entirely when the
               reader is not on this ladder, rather than inventing a placeholder. -->
          <div v-if="myEntry" class="mt-8 flex justify-center">
            <p
              class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-pill border border-border bg-surface px-4 py-2 text-body-2 text-fg-secondary"
            >
              <span>You are</span>
              <strong class="font-semibold text-fg">#{{ myEntry.rank }}</strong>
              <span>of {{ total }} ranked {{ total === 1 ? 'player' : 'players' }}</span>
              <span class="text-fg-muted">·</span>
              <strong class="font-semibold tabular-nums text-fg">{{
                formatRating(myEntry.rating_value)
              }}</strong>
              <UiTrendIndicator
                v-if="myEntry.trend_delta !== null"
                :value="myEntry.trend_delta"
                size="sm"
                suffix="in the last 7 days"
              />
              <span v-else class="text-caption text-fg-muted"
                >no rated match in the last 7 days</span
              >
            </p>
          </div>
        </template>
      </RankingBoard>

      <nav
        v-if="totalPages > 1"
        class="mt-4 flex items-center justify-center gap-1"
        aria-label="Rankings pages"
      >
        <UiButton
          variant="ghost"
          size="sm"
          :disabled="page === 1"
          aria-label="Previous page"
          @click="page = Math.max(1, page - 1)"
        >
          <UiIcon name="chevron-left" size="h-4 w-4" />
        </UiButton>

        <template v-for="(n, i) in pageNumbers" :key="n">
          <span v-if="i > 0 && n - pageNumbers[i - 1]! > 1" class="px-1 text-fg-muted">…</span>
          <button
            type="button"
            class="min-w-[2rem] rounded-button px-2.5 py-1 text-body-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            :class="
              n === page ? 'bg-primary text-on-primary' : 'text-fg-secondary hover:bg-surface-2'
            "
            :aria-current="n === page ? 'page' : undefined"
            @click="page = n"
          >
            {{ n }}
          </button>
        </template>

        <UiButton
          variant="ghost"
          size="sm"
          :disabled="page === totalPages"
          aria-label="Next page"
          @click="page = Math.min(totalPages, page + 1)"
        >
          <UiIcon name="chevron-right" size="h-4 w-4" />
        </UiButton>
      </nav>

      <p v-if="total" class="mt-3 text-center text-caption text-fg-muted">
        {{ total }} ranked {{ total === 1 ? 'player' : 'players' }}
        <template v-if="province"> in {{ province }}</template>
        <template v-if="debouncedSearch"> matching “{{ debouncedSearch }}”</template>
      </p>
    </template>
  </div>
</template>
