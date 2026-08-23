<script setup lang="ts">
/**
 * One ranking treatment, used everywhere a ladder is shown.
 *
 * /rankings received the podium-plus-table design (docs/33 §5.3); four other
 * screens kept hand-rolled versions of the same idea and drifted apart from it
 * and from each other — three separate podium implementations, one of them
 * rounding `numeric(5,3)` ratings to whole numbers so a 4.250 and a 3.500 both
 * showed as "4", another hiding the podium entirely below three players. This
 * component is that design extracted, so those screens cannot drift again.
 *
 * Two shapes of ladder exist in the product and both render here:
 *
 * - `variant="rating"` — ranked on rating. Shows rating, tier and 7-day trend.
 * - `variant="record"` — ranked on results, as an event's standings are. Shows
 *   wins/losses instead; those rows have no rating to show and no rating-based
 *   trend that is RLS-safe to read (see events/[eventId]/rankings.get.ts).
 *
 * The caller keeps its own filters, search and pagination. This owns the
 * podium, the table and the empty state, and nothing else.
 */
import type { PodiumEntry } from '~/components/ui/Podium.vue'
import type { Column } from '~/components/ui/DataTable.vue'
import { formatRating, tierForRating } from '~/utils/rating-tiers'

export interface RankingBoardEntry {
  rank: number
  player_id: string
  display_name: string
  /** Rating ladders only. Club rankings send just this and the name. */
  rating_value?: number | null
  matches_played?: number | null
  /** null means "no rated match in the window" — not a zero delta. */
  trend_delta?: number | null
  provisional?: boolean
  province?: string | null
  city?: string | null
  /** Record ladders only. */
  wins?: number | null
  losses?: number | null
}

const props = withDefaults(
  defineProps<{
    entries: RankingBoardEntry[]
    variant?: 'rating' | 'record'
    /** The top three lift out onto the podium. */
    showPodium?: boolean
    /** Denser rows and no location line, for sidebar and dashboard lists. */
    compact?: boolean
    /** The reader's own row, highlighted in the table and on the podium. */
    highlightId?: string | null
    loading?: boolean
    /** Decorative arc behind the podium. Off inside a card. */
    glow?: boolean
    emptyTitle?: string
    emptyMessage?: string
  }>(),
  {
    variant: 'rating',
    showPodium: true,
    compact: false,
    highlightId: null,
    loading: false,
    glow: true,
    emptyTitle: 'No ranked players yet',
    emptyMessage: 'Ratings appear here once matches have been played and verified.'
  }
)

const emit = defineEmits<{ select: [RankingBoardEntry] }>()

const isRating = computed(() => props.variant === 'rating')

/**
 * UiPodium handles a short array itself (its "Unclaimed" state), so this does
 * not gate on having three. The old hand-rolled podiums required exactly three
 * and rendered nothing at all on a two-player ladder.
 */
const podiumVisible = computed(() => props.showPodium && props.entries.length > 0)

const podium = computed<PodiumEntry[]>(() =>
  podiumVisible.value
    ? props.entries.slice(0, 3).map((entry) => ({
        id: entry.player_id,
        name: entry.display_name,
        rating: entry.rating_value ?? null,
        location: entry.city ?? entry.province ?? null,
        matchesPlayed: entry.matches_played ?? null,
        trendDelta: entry.trend_delta ?? null
      }))
    : []
)

const tableRows = computed(() => (podiumVisible.value ? props.entries.slice(3) : props.entries))

/**
 * A three-player ladder is entirely on the podium, and the table below it would
 * then render its own "no ranked players yet" state directly under three named
 * players — so the table is dropped rather than left to contradict the podium.
 * The empty state still shows when there is genuinely nobody.
 */
const showTable = computed(() => tableRows.value.length > 0 || !podiumVisible.value)

const columns = computed<Column<RankingBoardEntry>[]>(() => {
  const cols: Column<RankingBoardEntry>[] = [
    { key: 'rank', label: '#', numeric: true, width: 'w-16' },
    { key: 'player', label: 'Player' }
  ]
  if (isRating.value) {
    if (!props.compact) {
      cols.push({ key: 'matches', label: 'Matches', numeric: true, hideOnMobile: true })
    }
    cols.push({ key: 'rating', label: 'Rating', numeric: true })
    cols.push({ key: 'trend', label: 'Trend', numeric: true })
  } else {
    if (!props.compact) {
      cols.push({ key: 'matches', label: 'Played', numeric: true, hideOnMobile: true })
    }
    cols.push({ key: 'record', label: 'W–L', numeric: true })
  }
  return cols
})

const isHighlighted = (row: RankingBoardEntry) =>
  !!props.highlightId && row.player_id === props.highlightId

const tierName = (rating: number) => tierForRating(rating).name
</script>

<template>
  <div class="relative">
    <!-- Same atmospheric arc as /rankings. `z-0` with the content at `z-10`:
         a negative index puts it behind the page background entirely. -->
    <div
      v-if="glow && podiumVisible"
      class="dnl-podium-glow pointer-events-none absolute inset-x-0 top-0 z-0 h-[26rem]"
      aria-hidden="true"
    />

    <section v-if="podiumVisible || (loading && showPodium)" class="relative z-10 mb-8">
      <div v-if="loading" class="flex items-end justify-center gap-4">
        <div class="mt-12 h-32 w-28 animate-pulse rounded-t-card bg-surface-2" />
        <div class="h-44 w-32 animate-pulse rounded-t-card bg-surface-2" />
        <div class="mt-20 h-24 w-28 animate-pulse rounded-t-card bg-surface-2" />
      </div>
      <UiPodium
        v-else
        :entries="podium"
        :highlight-id="highlightId"
        @select="
          emit(
            'select',
            entries.find((e) => e.player_id === $event.id)!
          )
        "
      />
    </section>

    <!-- Between podium and table: /rankings puts the reader's own standing here,
         which only reads correctly directly under the top three. -->
    <div v-if="$slots['below-podium']" class="relative z-10 mb-8">
      <slot name="below-podium" />
    </div>

    <div v-if="showTable" class="relative z-10">
      <UiDataTable
        :columns="columns"
        :rows="tableRows"
        :row-key="(row) => row.player_id"
        :is-highlighted="isHighlighted"
        :loading="loading"
        :skeleton-rows="compact ? 5 : 8"
        clickable-rows
        :caption="isRating ? 'Player rankings by rating' : 'Player standings by record'"
        @row-click="emit('select', $event)"
      >
        <template #cell-rank="{ row }">
          <span
            class="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-button px-1.5 text-caption font-bold tabular-nums"
            :class="row.rank <= 3 ? 'bg-primary-soft text-primary' : 'text-fg-muted'"
            >{{ row.rank }}</span
          >
        </template>

        <template #cell-player="{ row }">
          <span class="flex items-center gap-3">
            <UiAvatar
              :name="row.display_name"
              :size="compact ? 'sm' : 'md'"
              :highlighted="isHighlighted(row)"
            />
            <span class="min-w-0">
              <span class="flex items-center gap-1.5">
                <span class="truncate font-medium text-fg">{{ row.display_name }}</span>
                <span
                  v-if="isHighlighted(row)"
                  class="shrink-0 rounded-pill bg-primary-soft px-1.5 py-0.5 text-caption font-medium text-primary"
                  >You</span
                >
              </span>
              <span v-if="!compact" class="block truncate text-caption text-fg-muted">
                {{ row.city || row.province || 'Location not set' }}
              </span>
            </span>
          </span>
        </template>

        <template #cell-matches="{ row }">
          <span class="tabular-nums text-fg-secondary">{{ row.matches_played ?? '—' }}</span>
        </template>

        <!-- Ratings are numeric(5,3); three decimals is the stored precision and
             the only format that tells two nearby players apart. -->
        <template #cell-rating="{ row }">
          <span class="inline-flex flex-col items-end">
            <span class="font-semibold tabular-nums text-fg">
              {{ row.rating_value == null ? 'Unrated' : formatRating(row.rating_value) }}
            </span>
            <span v-if="row.rating_value != null" class="text-caption text-fg-muted">
              {{ tierName(row.rating_value)
              }}<template v-if="row.provisional"> · provisional</template>
            </span>
          </span>
        </template>

        <!-- null means "no rated match in the window", which is not the same as
             a zero delta and must not look like one. -->
        <template #cell-trend="{ row }">
          <UiTrendIndicator
            v-if="row.trend_delta !== null && row.trend_delta !== undefined"
            :value="row.trend_delta"
            size="sm"
          />
          <span v-else class="text-caption text-fg-muted" title="No rated match in the last 7 days"
            >—</span
          >
        </template>

        <template #cell-record="{ row }">
          <span class="tabular-nums">
            <span class="font-semibold text-primary">{{ row.wins ?? 0 }}</span>
            <span class="mx-1 text-fg-muted">–</span>
            <span class="font-semibold text-danger">{{ row.losses ?? 0 }}</span>
          </span>
        </template>

        <template #empty>
          <slot name="empty">
            <UiEmptyState compact icon="trophy" :title="emptyTitle" :message="emptyMessage" />
          </slot>
        </template>
      </UiDataTable>
    </div>
  </div>
</template>
