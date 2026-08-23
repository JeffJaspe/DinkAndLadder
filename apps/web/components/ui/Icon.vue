<script setup lang="ts">
/**
 * Renders one glyph from the shared registry in `utils/icons.ts`.
 *
 * Icons are stroked with `currentColor` and carry no colour of their own, so
 * they inherit from whatever they sit in and need no theme handling.
 *
 * Decorative by default (`aria-hidden`). Pass a `label` when the icon is the
 * only content of a control and there is no visible text to name it.
 */
import { ICON_CIRCLES, ICON_PATHS, type IconName } from '~/utils/icons'

const props = withDefaults(
  defineProps<{
    name: IconName
    /** Tailwind size classes; override for anything other than 20px. */
    size?: string
    /** Heavier stroke reads better at small sizes, where 1.5 thins out. */
    strokeWidth?: number
    /** Accessible name. Omit for decorative icons sitting beside real text. */
    label?: string
  }>(),
  { size: 'h-5 w-5', strokeWidth: 1.5, label: undefined }
)

const path = computed(() => ICON_PATHS[props.name])
const circle = computed(() => ICON_CIRCLES[props.name])
</script>

<template>
  <svg
    :class="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :aria-hidden="label ? undefined : true"
    :role="label ? 'img' : undefined"
    :aria-label="label"
  >
    <circle v-if="circle" :cx="circle.cx" :cy="circle.cy" :r="circle.r" />
    <path :d="path" />
  </svg>
</template>
