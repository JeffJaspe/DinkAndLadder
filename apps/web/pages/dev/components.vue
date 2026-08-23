<script setup lang="ts">
/**
 * Dev-only component gallery.
 *
 * Every variant of every design-system primitive, in one place, so a change can
 * be reviewed in both themes without hunting for a screen that happens to use
 * it. Unit tests cover behaviour; this covers the thing tests are worst at —
 * whether it actually looks right.
 *
 * States are shown *including* their loading, empty and error variants, because
 * those are the ones that get built once and never looked at again.
 *
 * Not shipped: 404s outside dev.
 */
import { RATING_TIER_VIEWS } from '~/utils/rating-tiers'
import { ICON_PATHS, type IconName } from '~/utils/icons'

if (!import.meta.dev) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true })
}

definePageMeta({ layout: false })
useHead({ title: 'Components' })

const { resolvedTheme } = useTheme()
const toast = useToast()

const iconNames = Object.keys(ICON_PATHS) as IconName[]

const modalOpen = ref(false)
const destructiveModalOpen = ref(false)
const modalLoading = ref(false)

// Named rather than inline. As two statements in the template, Prettier splits
// the expression across lines and drops the separating `;`, which the Vue
// compiler then rejects — and re-adding the `;` is formatted straight back out.
// A function is the one form both tools accept.
function confirmDestructive() {
  destructiveModalOpen.value = false
  toast.info('Left the club')
}

const inputValue = ref('')
const inputWithError = ref('bad value')
const selectValue = ref('all')
const segmentValue = ref('singles')
const tabValue = ref('overview')
const stepperA = ref(11)
const stepperB = ref(21)

/** Deterministic sample series so the chart looks the same on every reload. */
const chartPoints = computed(() => {
  const out: { date: string; value: number }[] = []
  let value = 3.2
  for (let i = 29; i >= 0; i--) {
    value += (Math.sin(i * 1.7) + Math.cos(i * 0.6)) * 0.03
    out.push({
      date: new Date(Date.now() - i * 86_400_000).toISOString(),
      value: Math.round(value * 1000) / 1000
    })
  }
  return out
})

const podiumEntries = [
  { id: '1', name: 'Ana Reyes', rating: 4.812, location: 'Cebu City' },
  { id: '2', name: 'Ben Cruz', rating: 4.503, location: 'Makati' },
  { id: '3', name: 'Carlo Diaz', rating: 4.211, location: 'Davao City' }
]

const tableRows = podiumEntries.map((p, i) => ({ ...p, rank: i + 1, trend: [0.12, -0.04, 0][i]! }))

const tableColumns = [
  { key: 'rank', label: '#', numeric: true, width: 'w-14' },
  { key: 'name', label: 'Player' },
  { key: 'location', label: 'Location', hideOnMobile: true },
  { key: 'rating', label: 'Rating', numeric: true },
  { key: 'trend', label: 'Trend', numeric: true }
]

function confirmWithDelay() {
  modalLoading.value = true
  setTimeout(() => {
    modalLoading.value = false
    modalOpen.value = false
    toast.success('Match submitted successfully!')
  }, 900)
}
</script>

<template>
  <div class="min-h-screen bg-canvas px-4 py-8 text-fg sm:px-8">
    <div class="mx-auto max-w-5xl space-y-10">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="font-display text-heading-1">Components</h1>
          <p class="mt-1 text-body-2 text-fg-secondary">
            Dev-only gallery. Rendering <strong class="text-primary">{{ resolvedTheme }}</strong
            >. Tokens live at
            <NuxtLink to="/dev/theme" class="text-primary underline">/dev/theme</NuxtLink>.
          </p>
        </div>
        <UiThemeToggle show-label />
      </header>

      <!-- Buttons -->
      <section class="space-y-3">
        <h2 class="text-heading-3">Buttons</h2>
        <div class="space-y-3 rounded-card border border-border bg-surface p-5 shadow-card">
          <div class="flex flex-wrap items-center gap-3">
            <UiButton variant="primary">Primary</UiButton>
            <UiButton variant="secondary">Secondary</UiButton>
            <UiButton variant="accent">Accent</UiButton>
            <UiButton variant="danger">Dispute</UiButton>
            <UiButton variant="ghost">Ghost</UiButton>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <UiButton size="sm">Small</UiButton>
            <UiButton size="md">Medium</UiButton>
            <UiButton size="lg">Large</UiButton>
            <UiButton loading>Loading</UiButton>
            <UiButton disabled>Disabled</UiButton>
            <UiButton to="/rankings" variant="secondary">Renders an anchor</UiButton>
          </div>
          <UiButton full-width>Full width</UiButton>
        </div>
      </section>

      <!-- Form controls -->
      <section class="space-y-3">
        <h2 class="text-heading-3">Form controls</h2>
        <div
          class="grid gap-4 rounded-card border border-border bg-surface p-5 sm:grid-cols-2 shadow-card"
        >
          <UiInput
            v-model="inputValue"
            label="Search players"
            icon="search"
            placeholder="Search players…"
          />
          <UiInput v-model="inputValue" label="With a hint" hint="Shown until there is an error." />
          <UiInput
            v-model="inputWithError"
            label="With an error"
            error="That name is already taken."
          />
          <UiInput v-model="inputValue" label="Disabled" disabled placeholder="Not editable" />
          <UiSelect
            v-model="selectValue"
            label="Status"
            :options="[
              { value: 'all', label: 'All Status' },
              { value: 'open', label: 'Registration open' },
              { value: 'done', label: 'Completed' }
            ]"
          />
          <div class="flex items-end gap-3">
            <UiStepper v-model="stepperA" :max="30" label="Your score" />
            <span class="pb-2 text-fg-muted">–</span>
            <UiStepper v-model="stepperB" :max="30" label="Opponent score" />
          </div>
        </div>
      </section>

      <!-- Navigation -->
      <section class="space-y-3">
        <h2 class="text-heading-3">Navigation</h2>
        <div class="space-y-4 rounded-card border border-border bg-surface p-5 shadow-card">
          <UiSegmented
            v-model="segmentValue"
            label="Rating type"
            :items="[
              { value: 'singles', label: 'Singles' },
              { value: 'doubles', label: 'Doubles' }
            ]"
          />
          <UiSegmented
            v-model="segmentValue"
            size="sm"
            label="With counts"
            :items="[
              { value: 'singles', label: 'Pending', count: 3 },
              { value: 'doubles', label: 'Verified', count: 12 }
            ]"
          />
          <!-- queryKey null: the gallery must not rewrite the URL on every click -->
          <UiTabs
            v-model="tabValue"
            :query-key="null"
            :tabs="[
              { value: 'overview', label: 'Overview' },
              { value: 'matches', label: 'Matches', count: 24 },
              { value: 'stats', label: 'Stats' }
            ]"
          />
        </div>
      </section>

      <!-- Identity -->
      <section class="space-y-3">
        <h2 class="text-heading-3">Avatars and badges</h2>
        <div class="space-y-4 rounded-card border border-border bg-surface p-5 shadow-card">
          <div class="flex flex-wrap items-end gap-3">
            <UiAvatar name="Ana Reyes" size="xs" />
            <UiAvatar name="Ben Cruz" size="sm" />
            <UiAvatar name="Carlo Diaz" size="md" />
            <UiAvatar name="Dana Lim" size="lg" />
            <UiAvatar name="Elena Marquez" size="xl" />
            <UiAvatar name="You" size="lg" highlighted />
            <UiAvatar :name="null" size="lg" />
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <UiRatingBadge v-for="tier in RATING_TIER_VIEWS" :key="tier.name" :rating="tier.min" />
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <UiRatingBadge :rating="3.2" provisional />
            <UiRatingBadge :rating="null" />
            <UiTrendIndicator :value="0.125" />
            <UiTrendIndicator :value="-0.06" />
            <UiTrendIndicator :value="0" />
            <UiTrendIndicator :value="0.4" suffix="from last 7 days" />
          </div>
        </div>
      </section>

      <!-- Data display -->
      <section class="space-y-3">
        <h2 class="text-heading-3">Podium and table</h2>
        <div class="rounded-card border border-border bg-surface p-5 shadow-card">
          <UiPodium :entries="podiumEntries" highlight-id="2" />
        </div>
        <UiDataTable
          :columns="tableColumns"
          :rows="tableRows"
          :row-key="(row) => row.id"
          :is-highlighted="(row) => row.id === '2'"
          caption="Sample rankings"
        >
          <template #cell-rank="{ row }">{{ row.rank }}</template>
          <template #cell-name="{ row }">
            <span class="flex items-center gap-2">
              <UiAvatar :name="row.name" size="sm" />
              <span class="font-medium text-fg">{{ row.name }}</span>
            </span>
          </template>
          <template #cell-location="{ row }">
            <span class="text-fg-secondary">{{ row.location }}</span>
          </template>
          <template #cell-rating="{ row }">
            <span class="font-semibold tabular-nums">{{ row.rating.toFixed(3) }}</span>
          </template>
          <template #cell-trend="{ row }">
            <UiTrendIndicator :value="row.trend" size="sm" />
          </template>
        </UiDataTable>

        <UiDataTable
          :columns="tableColumns"
          :rows="[]"
          :row-key="() => 'x'"
          loading
          :skeleton-rows="3"
          caption="Loading state"
        />
      </section>

      <!-- Chart -->
      <section class="space-y-3">
        <h2 class="text-heading-3">Line chart</h2>
        <div class="rounded-card border border-border bg-surface p-5 shadow-card">
          <UiLineChart :points="chartPoints" label="Sample rating over 30 days" />
        </div>
        <div class="rounded-card border border-border bg-surface p-5 shadow-card">
          <UiLineChart :points="[]" label="Empty chart" />
        </div>
      </section>

      <!-- States -->
      <section class="space-y-3">
        <h2 class="text-heading-3">Empty and error states</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <UiEmptyState
            title="No matches yet"
            message="Play your first match to start your journey!"
            action-label="Submit a match"
            action-to="/matches/submit"
          />
          <UiErrorState detail="TypeError: failed to fetch" @retry="toast.info('Retry pressed')" />
          <UiEmptyState
            compact
            icon="search"
            title="No results"
            message="Nothing matched that search."
          />
          <UiErrorState compact @retry="toast.info('Retry pressed')" />
        </div>
      </section>

      <!-- Overlays -->
      <section class="space-y-3">
        <h2 class="text-heading-3">Modal and toasts</h2>
        <div
          class="flex flex-wrap gap-3 rounded-card border border-border bg-surface p-5 shadow-card"
        >
          <UiButton @click="modalOpen = true">Confirm verification</UiButton>
          <UiButton variant="danger" @click="destructiveModalOpen = true">Destructive</UiButton>
          <UiButton variant="secondary" @click="toast.success('Match submitted successfully!')"
            >Success toast</UiButton
          >
          <UiButton variant="secondary" @click="toast.info('Rating updated! +0.120')"
            >Info toast</UiButton
          >
          <UiButton variant="secondary" @click="toast.error('Failed to submit match')"
            >Error toast</UiButton
          >
        </div>

        <UiModal
          v-model="modalOpen"
          title="Confirm Verification"
          description="Are you sure you want to verify this match?"
          confirm-label="Confirm"
          :loading="modalLoading"
          @confirm="confirmWithDelay"
        />
        <UiModal
          v-model="destructiveModalOpen"
          title="Leave this club?"
          description="You will lose access to club events and announcements."
          confirm-label="Leave club"
          destructive
          @confirm="confirmDestructive"
        />
      </section>

      <!-- Cover art -->
      <section class="space-y-3">
        <h2 class="text-heading-3">Generated cover art</h2>
        <div class="grid gap-4 sm:grid-cols-3">
          <UiCoverArt name="Cebu Picklers" />
          <UiCoverArt name="Metro Manila Open" />
          <UiCoverArt name="Davao Dink Dynasty" />
        </div>
      </section>

      <!-- Icons -->
      <section class="space-y-3">
        <h2 class="text-heading-3">Icons ({{ iconNames.length }})</h2>
        <div
          class="grid grid-cols-4 gap-3 rounded-card border border-border bg-surface p-5 sm:grid-cols-6 lg:grid-cols-8 shadow-card"
        >
          <div
            v-for="name in iconNames"
            :key="name"
            class="flex flex-col items-center gap-1 text-center"
          >
            <UiIcon :name="name" size="h-6 w-6" class="text-fg-secondary" />
            <span class="break-all text-[10px] text-fg-muted">{{ name }}</span>
          </div>
        </div>
      </section>
    </div>

    <UiToaster />
  </div>
</template>
