<script setup lang="ts">
/**
 * Segmented control — Singles / Doubles across Rankings and Submit Match, and
 * the All / Pending / Verified / Disputed chips on the mobile Matches screen.
 *
 * Distinct from `UiTabs`: tabs switch a whole panel of content and are
 * navigation; a segmented control filters or scopes what is already on screen.
 * The mockups draw them differently for that reason — a pill group here, an
 * underline there — so they stay separate components.
 */

export interface SegmentItem {
  value: string
  label: string
  count?: number | null
}

const props = withDefaults(
  defineProps<{
    items: SegmentItem[]
    modelValue: string
    size?: 'sm' | 'md'
    /** Stretch to fill the row — the mobile filter chips do this. */
    block?: boolean
    /** Accessible name for the group, e.g. "Rating type". */
    label?: string
  }>(),
  { size: 'md', block: false, label: undefined }
)

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const sizeClass = computed(() =>
  props.size === 'sm' ? 'px-3 py-1 text-caption' : 'px-4 py-1.5 text-body-2'
)
</script>

<template>
  <div
    class="inline-flex gap-1 rounded-pill border border-border bg-surface-2 p-1"
    :class="block ? 'flex w-full' : ''"
    role="group"
    :aria-label="label"
  >
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :aria-pressed="item.value === modelValue"
      class="rounded-pill font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :class="[
        sizeClass,
        block ? 'flex-1' : '',
        item.value === modelValue
          ? 'bg-primary text-on-primary'
          : 'text-fg-secondary hover:bg-surface-3 hover:text-fg'
      ]"
      @click="emit('update:modelValue', item.value)"
    >
      {{ item.label }}
      <!-- No opacity: dimming already-muted text put the count at 3.2:1. -->
      <span v-if="item.count !== null && item.count !== undefined" class="ml-1">
        {{ item.count }}
      </span>
    </button>
  </div>
</template>
