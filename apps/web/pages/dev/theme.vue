<script setup lang="ts">
/**
 * Dev-only token preview.
 *
 * Phase 1 is plumbing: the ~1,900 hardcoded hex classes across the app are not
 * migrated yet (that is Phase 2), so toggling the theme on a real screen barely
 * changes anything. This page renders the token layer directly so the palette,
 * the type ramp and the switching behaviour can be reviewed before the codemod
 * runs against 55 files.
 *
 * The sample cards pull the signed-in player's real rating, rank and city from
 * the same endpoints the dashboard uses — no invented numbers. That matters for
 * a colour review: a rating badge has to be checked against a rating that
 * actually exists in this database, and a provisional or unrated player is the
 * case most likely to look wrong.
 *
 * Not shipped: it 404s outside dev.
 *
 * See docs/33-DESIGN-SYSTEM-AND-THEMING-SPEC.md.
 */
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { RankingEntryDto } from '~/server/domains/rating/dto/ranking.dto'
import type { PlayerRatingDto } from '~/server/domains/rating/dto/rating.dto'

if (!import.meta.dev) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true })
}

definePageMeta({ layout: false })

const { resolvedTheme } = useTheme()

// Same endpoints pages/dashboard.vue uses, so the preview cannot drift from
// what the real screens show. `server: false` keeps this dev page from adding
// SSR round-trips.
const {
  data: profile,
  pending: profilePending,
  error: profileError
} = await useFetch<PlayerProfileDto>('/api/v1/players/me', { server: false })

const {
  data: ratings,
  pending: ratingsPending,
  error: ratingsError
} = await useFetch<{ singles: PlayerRatingDto | null; doubles: PlayerRatingDto | null }>(
  '/api/v1/players/me/ratings',
  { server: false }
)

const { data: rankings } = await useFetch<{ data: RankingEntryDto[] }>('/api/v1/rankings', {
  query: { rating_type: 'singles', limit: 100 },
  server: false
})

const pending = computed(() => profilePending.value || ratingsPending.value)
const failed = computed(() => profileError.value || ratingsError.value)

const singlesRating = computed(() => ratings.value?.singles?.rating_value ?? null)
const isProvisional = computed(() => ratings.value?.singles?.provisional ?? false)
const matchesPlayed = computed(() => ratings.value?.singles?.matches_played ?? 0)

/**
 * The caller's own row in the singles ladder, if they are on it. `rank` comes
 * off the entry itself — the server computes it, so it stays correct under
 * paging and ties, which an array index would not.
 */
const myRankEntry = computed(() => {
  const id = profile.value?.id
  if (!id || !rankings.value?.data) return null
  return rankings.value.data.find((entry) => entry.player_id === id) ?? null
})

const location = computed(() => {
  const parts = [profile.value?.city, profile.value?.province].filter(Boolean)
  return parts.length ? parts.join(', ') : null
})

/**
 * Tier thresholds from the mockup's rating-badge legend. These live here only
 * until Phase 3 extracts them into `utils/rating-tiers.ts` as the single source
 * the RatingBadge component reads.
 */
const RATING_TIERS = [
  { name: 'Gold', min: 1900, range: '1900+', klass: 'text-rating-gold' },
  { name: 'Silver', min: 1700, range: '1700–1899', klass: 'text-rating-silver' },
  { name: 'Bronze', min: 1400, range: '1400–1699', klass: 'text-rating-bronze' },
  { name: 'Iron', min: 0, range: '<1400', klass: 'text-rating-iron' }
]

const myTier = computed(() => {
  const value = singlesRating.value
  if (value === null) return null
  return RATING_TIERS.find((tier) => value >= tier.min) ?? null
})

const surfaceTokens = [
  { name: 'canvas', klass: 'bg-canvas' },
  { name: 'surface', klass: 'bg-surface' },
  { name: 'surface-2', klass: 'bg-surface-2' },
  { name: 'surface-3', klass: 'bg-surface-3' },
  { name: 'border', klass: 'bg-border' },
  { name: 'border-strong', klass: 'bg-border-strong' }
]

const brandTokens = [
  { name: 'primary', klass: 'bg-primary' },
  { name: 'primary-hover', klass: 'bg-primary-hover' },
  { name: 'primary-soft', klass: 'bg-primary-soft' },
  { name: 'accent', klass: 'bg-accent' },
  { name: 'accent-soft', klass: 'bg-accent-soft' }
]

const statusTokens = [
  { name: 'success', klass: 'bg-success' },
  { name: 'warning', klass: 'bg-warning' },
  { name: 'warning-fill', klass: 'bg-warning-fill' },
  { name: 'danger', klass: 'bg-danger' },
  { name: 'info', klass: 'bg-info' }
]

const textTokens = [
  { name: 'fg', klass: 'text-fg', note: 'headings, stat numbers, body' },
  { name: 'fg-secondary', klass: 'text-fg-secondary', note: 'supporting copy' },
  { name: 'fg-muted', klass: 'text-fg-muted', note: '12px captions and meta' }
]

const statusPills = [
  { label: 'Pending', klass: 'bg-warning-soft/20 text-warning' },
  { label: 'Verified', klass: 'bg-success-soft/20 text-success' },
  { label: 'Disputed', klass: 'bg-danger-soft/20 text-danger' },
  { label: 'Draft', klass: 'bg-surface-2 text-fg-muted' }
]
</script>

<template>
  <div class="min-h-screen bg-canvas px-4 py-8 text-fg sm:px-8">
    <div class="mx-auto max-w-5xl space-y-10">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-heading-1">Design tokens</h1>
          <p class="mt-1 text-body-2 text-fg-secondary">
            Dev-only preview of <code>assets/css/tokens.css</code>. Currently rendering
            <strong class="text-primary">{{ resolvedTheme }}</strong>.
          </p>
        </div>
        <UiThemeToggle show-label />
      </header>

      <section class="space-y-3">
        <h2 class="text-heading-3">Your live data</h2>

        <!-- Loading -->
        <div
          v-if="pending"
          class="grid gap-3 sm:grid-cols-2"
        >
          <div
            v-for="n in 2"
            :key="n"
            class="rounded-card border border-border bg-surface p-6 shadow-card"
          >
            <div class="h-3 w-16 animate-pulse rounded bg-surface-2" />
            <div class="mt-3 h-8 w-24 animate-pulse rounded bg-surface-2" />
            <div class="mt-3 h-3 w-32 animate-pulse rounded bg-surface-2" />
          </div>
        </div>

        <!-- Error -->
        <div
          v-else-if="failed"
          class="rounded-card border border-danger/40 bg-danger/5 p-6 text-center"
        >
          <p class="text-body-1 text-fg">Something went wrong</p>
          <p class="mt-1 text-body-2 text-fg-secondary">
            Could not load your profile or ratings. Sign in and try again.
          </p>
        </div>

        <!-- Empty: signed in, but nothing to show yet -->
        <div
          v-else-if="!profile"
          class="rounded-card border border-border bg-surface p-6 text-center shadow-card"
        >
          <p class="text-body-1 text-fg">No player profile yet</p>
          <p class="mt-1 text-body-2 text-fg-secondary">
            Save a profile to see your real rating and rank rendered in these tokens.
          </p>
        </div>

        <!-- Real data -->
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-card bg-gradient-to-br from-grad-from to-grad-to p-6 shadow-card">
            <p class="text-caption uppercase tracking-wide text-fg-muted">Rating · singles</p>
            <p v-if="singlesRating !== null" class="text-stat-md text-fg">
              {{ Math.round(singlesRating) }}
            </p>
            <p v-else class="mt-1 text-body-1 text-fg-muted">Unrated</p>
            <p v-if="myTier" class="text-caption" :class="myTier.klass">
              {{ myTier.name }} tier
              <span v-if="isProvisional" class="text-warning">· provisional</span>
            </p>
            <p v-else class="text-caption text-fg-muted">
              Play a match to get your first rating
            </p>
            <p class="mt-2 text-caption text-fg-muted">
              {{ matchesPlayed }} {{ matchesPlayed === 1 ? 'match' : 'matches' }} played
            </p>
          </div>

          <div class="rounded-card border border-border bg-surface p-6 shadow-card">
            <p class="text-caption uppercase tracking-wide text-fg-muted">Rank · singles</p>
            <p v-if="myRankEntry" class="text-stat-md text-fg">#{{ myRankEntry.rank }}</p>
            <p v-else class="mt-1 text-body-1 text-fg-muted">Unranked</p>
            <p class="text-caption text-fg-secondary">
              {{ profile.display_name }}<span v-if="location"> · {{ location }}</span>
            </p>
            <p v-if="!myRankEntry" class="mt-2 text-caption text-fg-muted">
              Not in the top {{ rankings?.data?.length ?? 0 }} of the singles ladder
            </p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-heading-3">Surfaces</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div
            v-for="swatch in surfaceTokens"
            :key="swatch.name"
            class="overflow-hidden rounded-card border border-border bg-surface shadow-card"
          >
            <div class="h-16 w-full" :class="swatch.klass" />
            <p class="px-3 py-2 text-caption text-fg-muted">{{ swatch.name }}</p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-heading-3">Brand</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div
            v-for="swatch in brandTokens"
            :key="swatch.name"
            class="overflow-hidden rounded-card border border-border bg-surface shadow-card"
          >
            <div class="h-16 w-full" :class="swatch.klass" />
            <p class="px-3 py-2 text-caption text-fg-muted">{{ swatch.name }}</p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-heading-3">Status</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div
            v-for="swatch in statusTokens"
            :key="swatch.name"
            class="overflow-hidden rounded-card border border-border bg-surface shadow-card"
          >
            <div class="h-16 w-full" :class="swatch.klass" />
            <p class="px-3 py-2 text-caption text-fg-muted">{{ swatch.name }}</p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-heading-3">Text on canvas and on a card</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-2 rounded-card border border-border p-4">
            <p class="text-caption uppercase tracking-wide text-fg-muted">on canvas</p>
            <p v-for="item in textTokens" :key="item.name" :class="item.klass">
              {{ item.name }} — {{ item.note }}
            </p>
          </div>
          <div class="space-y-2 rounded-card border border-border bg-surface p-4 shadow-card">
            <p class="text-caption uppercase tracking-wide text-fg-muted">on surface</p>
            <p v-for="item in textTokens" :key="item.name" :class="item.klass">
              {{ item.name }} — {{ item.note }}
            </p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-heading-3">Type ramp</h2>
        <div class="space-y-2 rounded-card border border-border bg-surface p-5 shadow-card">
          <p class="font-display text-heading-1">Heading 1 — Poppins 32 Bold</p>
          <p class="font-display text-heading-2">Heading 2 — Poppins 24 SemiBold</p>
          <p class="font-display text-heading-3">Heading 3 — Poppins 20 SemiBold</p>
          <p class="text-body-1 text-fg-secondary">Body 1 — Inter 16 Regular</p>
          <p class="text-body-2 text-fg-secondary">Body 2 — Inter 14 Regular</p>
          <p class="text-caption text-fg-muted">Caption — Inter 12 Regular</p>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-heading-3">Status pills and rating tiers</h2>
        <div class="space-y-4 rounded-card border border-border bg-surface p-5 shadow-card">
          <div class="flex flex-wrap gap-2">
            <span
              v-for="pill in statusPills"
              :key="pill.label"
              class="rounded-badge px-2.5 py-1 text-caption font-medium"
              :class="pill.klass"
            >
              {{ pill.label }}
            </span>
          </div>
          <div class="flex flex-wrap gap-4">
            <span
              v-for="tier in RATING_TIERS"
              :key="tier.name"
              class="text-body-2 font-semibold"
              :class="[tier.klass, myTier?.name === tier.name ? 'underline underline-offset-4' : '']"
            >
              {{ tier.name }} <span class="font-normal text-fg-muted">{{ tier.range }}</span>
            </span>
          </div>
          <p v-if="myTier" class="text-caption text-fg-muted">
            Underlined is your current tier.
          </p>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-heading-3">Buttons</h2>
        <div class="flex flex-wrap gap-3 rounded-card border border-border bg-surface p-5 shadow-card">
          <button
            class="rounded-button bg-primary px-4 py-2 text-body-2 font-medium text-on-primary transition-colors hover:bg-primary-hover"
          >
            Primary
          </button>
          <button
            class="rounded-button border border-border-strong px-4 py-2 text-body-2 font-medium text-fg transition-colors hover:bg-surface-3"
          >
            Secondary
          </button>
          <button class="rounded-button bg-accent px-4 py-2 text-body-2 font-medium text-on-accent">
            Accent
          </button>
          <button
            class="rounded-button border border-danger px-4 py-2 text-body-2 font-medium text-danger transition-colors hover:bg-danger/10"
          >
            Dispute
          </button>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-heading-3">Inputs</h2>
        <div class="grid gap-3 rounded-card border border-border bg-surface p-5 shadow-card sm:grid-cols-2">
          <input
            type="text"
            placeholder="Search players…"
            class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg placeholder:text-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
          <input
            type="date"
            class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
        </div>
        <p class="text-caption text-fg-muted">
          The date field checks the theme-conditional picker glyph — it must stay visible in both themes.
        </p>
      </section>
    </div>
  </div>
</template>
