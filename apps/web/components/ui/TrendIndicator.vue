<script setup lang="ts">
interface Props {
  value: number
  showValue?: boolean
  size?: 'sm' | 'md'
}

const props = withDefaults(defineProps<Props>(), {
  showValue: true,
  size: 'md'
})

const direction = computed(() => {
  if (props.value > 0) return 'up'
  if (props.value < 0) return 'down'
  return 'neutral'
})

const colorClass = computed(() => {
  switch (direction.value) {
    case 'up': return 'text-success'
    case 'down': return 'text-error'
    default: return 'text-text-muted'
  }
})

const sizeClasses = computed(() => {
  return props.size === 'sm' ? 'text-xs gap-0.5' : 'text-sm gap-1'
})

const iconSize = computed(() => {
  return props.size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
})

const formattedValue = computed(() => {
  if (props.value > 0) return `+${props.value.toFixed(3)}`
  return props.value.toFixed(3)
})
</script>

<template>
  <span class="inline-flex items-center font-medium" :class="[colorClass, sizeClasses]">
    <svg
      v-if="direction === 'up'"
      :class="iconSize"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
    <svg
      v-else-if="direction === 'down'"
      :class="iconSize"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
    <svg
      v-else
      :class="iconSize"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
    </svg>
    <span v-if="showValue">{{ formattedValue }}</span>
  </span>
</template>
