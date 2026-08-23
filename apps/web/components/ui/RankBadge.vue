<script setup lang="ts">
/**
 * A rank numeral in a medal-coloured disc.
 *
 * Type scale is the token scale, not raw Tailwind sizes: this was the last
 * primitive still on `text-xs`/`text-sm`/`text-xl` after the token pass, which
 * left it a half-step out of line with every other badge next to it.
 *
 * Ranks are tabular-figured so a column of them lines up, the same rule the
 * ratings columns follow.
 */
interface Props {
  rank: number
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md'
})

const isPodium = computed(() => props.rank <= 3)

const medalColor = computed(() => {
  switch (props.rank) {
    case 1:
      return 'bg-rating-gold text-on-accent'
    case 2:
      return 'bg-rating-silver text-on-accent'
    case 3:
      return 'bg-rating-bronze text-on-accent'
    default:
      return 'bg-surface-3 text-fg-secondary'
  }
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-6 w-6 text-caption'
    case 'lg':
      return 'h-12 w-12 text-heading-3'
    default:
      return 'h-8 w-8 text-body-2'
  }
})
</script>

<template>
  <div
    class="inline-flex items-center justify-center rounded-pill font-bold tabular-nums"
    :class="[sizeClasses, medalColor]"
  >
    <span v-if="isPodium">#{{ rank }}</span>
    <span v-else>{{ rank }}</span>
  </div>
</template>
