<script setup lang="ts">
/**
 * The ↑/↓ trend column from the Rankings table and the "+12 from last 7 days"
 * line on the rating cards.
 *
 * Direction is carried by an arrow as well as colour: a red/green pair alone is
 * invisible to the ~8% of men with red-green colour blindness, and this is the
 * one signal the rankings page exists to convey.
 */
import { formatRatingDelta } from '~/utils/rating-tiers'

const props = withDefaults(
  defineProps<{
    value: number | null | undefined
    showValue?: boolean
    size?: 'sm' | 'md'
    /** Trailing context, e.g. "from last 7 days". */
    suffix?: string | null
  }>(),
  { showValue: true, size: 'md', suffix: null }
)

const direction = computed(() => {
  if (props.value === null || props.value === undefined || props.value === 0) return 'flat'
  return props.value > 0 ? 'up' : 'down'
})

const TONE = {
  up: 'text-success',
  down: 'text-danger',
  flat: 'text-fg-muted'
} as const

const ICON = { up: 'arrow-up', down: 'arrow-down', flat: 'minus' } as const

const srLabel = computed(() =>
  direction.value === 'flat' ? 'no change' : direction.value === 'up' ? 'up' : 'down'
)
</script>

<template>
  <span
    class="inline-flex items-center font-medium tabular-nums"
    :class="[TONE[direction], size === 'sm' ? 'gap-0.5 text-caption' : 'gap-1 text-body-2']"
  >
    <UiIcon :name="ICON[direction]" :size="size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'" :stroke-width="2.5" />
    <span class="sr-only">{{ srLabel }}</span>
    <span v-if="showValue">{{ formatRatingDelta(value) }}</span>
    <span v-if="suffix" class="font-normal text-fg-muted">{{ suffix }}</span>
  </span>
</template>
