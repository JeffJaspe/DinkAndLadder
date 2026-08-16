<script setup lang="ts">
interface Props {
  variant?: 'text' | 'circular' | 'rectangular' | 'card'
  width?: string
  height?: string
  lines?: number
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'text',
  lines: 1
})

const baseClass = 'animate-pulse bg-surface-light'

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'circular':
      return 'rounded-full'
    case 'rectangular':
      return 'rounded-button'
    case 'card':
      return 'rounded-card'
    default:
      return 'rounded'
  }
})

const dimensions = computed(() => {
  const style: Record<string, string> = {}

  if (props.width) {
    style.width = props.width
  } else if (props.variant === 'circular') {
    style.width = '40px'
  } else if (props.variant === 'card') {
    style.width = '100%'
  }

  if (props.height) {
    style.height = props.height
  } else {
    switch (props.variant) {
      case 'circular':
        style.height = '40px'
        break
      case 'card':
        style.height = '120px'
        break
      case 'rectangular':
        style.height = '32px'
        break
      default:
        style.height = '16px'
    }
  }

  return style
})
</script>

<template>
  <div v-if="variant === 'text' && lines > 1" class="space-y-2">
    <div
      v-for="i in lines"
      :key="i"
      :class="[baseClass, variantClasses]"
      :style="{
        ...dimensions,
        width: i === lines ? '70%' : dimensions.width
      }"
    />
  </div>
  <div
    v-else
    :class="[baseClass, variantClasses]"
    :style="dimensions"
  />
</template>
