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
    case 1: return 'bg-rating-gold text-on-accent'
    case 2: return 'bg-rating-silver text-on-accent'
    case 3: return 'bg-rating-bronze text-on-accent'
    default: return 'bg-surface-3 text-fg-secondary'
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
