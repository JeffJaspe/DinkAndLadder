<script setup lang="ts">
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
    case 1: return 'bg-rating-gold text-background'
    case 2: return 'bg-rating-silver text-background'
    case 3: return 'bg-rating-bronze text-white'
    default: return 'bg-surface-light text-text-primary'
  }
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm': return 'h-6 w-6 text-xs'
    case 'lg': return 'h-12 w-12 text-xl'
    default: return 'h-8 w-8 text-sm'
  }
})
</script>

<template>
  <div
    class="inline-flex items-center justify-center rounded-full font-bold"
    :class="[sizeClasses, medalColor]"
  >
    <span v-if="isPodium">#{{ rank }}</span>
    <span v-else>{{ rank }}</span>
  </div>
</template>
