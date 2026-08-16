<script setup lang="ts">
interface Props {
  rating: number
  size?: 'sm' | 'md' | 'lg'
  showTier?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  showTier: true
})

const tier = computed(() => {
  if (props.rating >= 4.0) return 'gold'
  if (props.rating >= 3.0) return 'silver'
  return 'bronze'
})

const tierLabel = computed(() => {
  if (props.rating >= 4.0) return 'Pro'
  if (props.rating >= 3.0) return 'Intermediate'
  return 'Beginner'
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm': return 'text-lg px-2 py-1'
    case 'lg': return 'text-stat-md px-4 py-2'
    default: return 'text-2xl px-3 py-1.5'
  }
})

const tierColors = {
  gold: 'bg-rating-gold/20 text-rating-gold border-rating-gold',
  silver: 'bg-rating-silver/20 text-rating-silver border-rating-silver',
  bronze: 'bg-rating-bronze/20 text-rating-bronze border-rating-bronze'
}
</script>

<template>
  <div
    class="inline-flex items-center gap-2 rounded-badge border font-bold"
    :class="[sizeClasses, tierColors[tier]]"
  >
    <span>{{ rating.toFixed(3) }}</span>
    <span v-if="showTier && size !== 'sm'" class="text-xs font-medium opacity-80">
      {{ tierLabel }}
    </span>
  </div>
</template>
