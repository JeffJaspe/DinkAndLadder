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

// 5-tier rating system: Novice, Beginner, Intermediate, Advanced, Professional
const tier = computed(() => {
  if (props.rating >= 5.5) return 'professional'
  if (props.rating >= 4.5) return 'advanced'
  if (props.rating >= 3.5) return 'intermediate'
  if (props.rating >= 3.0) return 'beginner'
  return 'novice'
})

const tierLabel = computed(() => {
  if (props.rating >= 5.5) return 'Professional'
  if (props.rating >= 4.5) return 'Advanced'
  if (props.rating >= 3.5) return 'Intermediate'
  if (props.rating >= 3.0) return 'Beginner'
  return 'Novice'
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm': return 'text-lg px-2 py-1'
    case 'lg': return 'text-stat-md px-4 py-2'
    default: return 'text-2xl px-3 py-1.5'
  }
})

const tierColors: Record<string, string> = {
  professional: 'bg-purple-500/20 text-purple-400 border-purple-400',
  advanced: 'bg-rating-gold/20 text-rating-gold border-rating-gold',
  intermediate: 'bg-rating-silver/20 text-rating-silver border-rating-silver',
  beginner: 'bg-rating-bronze/20 text-rating-bronze border-rating-bronze',
  novice: 'bg-gray-500/20 text-gray-400 border-gray-400'
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
