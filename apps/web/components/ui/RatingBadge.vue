<script setup lang="ts">
/**
 * Rating + tier badge.
 *
 * This component previously carried its own five-tier table (Novice/Beginner/
 * Intermediate/Advanced/Professional at 3.0/3.5/4.5/5.5) which matched neither
 * the mockup nor the rating domain. The authoritative bands are the nine in
 * `server/domains/rating/data/question-bank.ts`; `utils/rating-tiers.ts`
 * mirrors them for the client and a test keeps the two in step.
 *
 * Ratings are `numeric(5,3)`, so three decimals is the display format — two
 * would render genuinely different players as the same number.
 */
import { formatRating, tierForRating } from '~/utils/rating-tiers'

const props = withDefaults(
  defineProps<{
    rating: number | null | undefined
    size?: 'sm' | 'md' | 'lg'
    showTier?: boolean
    /** Marks a rating that has not stabilised yet. */
    provisional?: boolean
  }>(),
  { size: 'md', showTier: true, provisional: false }
)

const SIZES = {
  sm: 'px-2 py-0.5 text-caption gap-1',
  md: 'px-2.5 py-1 text-body-2 gap-1.5',
  lg: 'px-3 py-1.5 text-heading-3 gap-2'
} as const

const tier = computed(() =>
  props.rating === null || props.rating === undefined ? null : tierForRating(props.rating)
)
</script>

<template>
  <span
    class="inline-flex items-center rounded-badge font-semibold tabular-nums"
    :class="[SIZES[size], tier ? [tier.softClass, 'text-fg'] : 'bg-surface-2 text-fg-muted']"
    :title="tier?.description"
  >
    <span>{{ formatRating(rating) }}</span>
    <!-- No opacity: it compounded on an already-tinted background and took the
         tier label under AA in both themes. -->
    <span
      v-if="showTier && tier && size !== 'sm'"
      class="text-caption font-medium text-fg-secondary"
    >
      {{ tier.name }}
    </span>
    <!-- Not `text-warning`: amber over a tier wash measured 4.08:1 on bronze.
         The badge already sits on a tinted ground, so the marker leans on the
         word and italics rather than a colour it cannot hold. -->
    <span
      v-if="provisional"
      class="text-caption font-medium italic text-fg-secondary"
      title="Not enough matches for a stable rating"
    >
      · provisional
    </span>
  </span>
</template>
