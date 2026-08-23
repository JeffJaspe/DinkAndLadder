<script setup lang="ts">
/**
 * Filter dropdown — "All Regions", "Cebu City", "All Status" in the mockups.
 *
 * A styled native `<select>` rather than a custom listbox: it gets keyboard
 * support, type-ahead, and the platform's own picker on mobile for free, and a
 * hand-rolled listbox would have to reimplement all of it worse. The only
 * custom part is the chevron, since the native arrow cannot be themed.
 */

export interface SelectOption {
  value: string
  label: string
}

withDefaults(
  defineProps<{
    modelValue: string
    options: SelectOption[]
    /** Visible label. Omit only when a nearby heading already names the control. */
    label?: string
    /** Accessible name when there is no visible label. */
    ariaLabel?: string
    size?: 'sm' | 'md'
  }>(),
  { label: undefined, ariaLabel: undefined, size: 'md' }
)

const emit = defineEmits<{ 'update:modelValue': [string] }>()
</script>

<template>
  <label class="inline-flex flex-col gap-1">
    <span v-if="label" class="text-caption font-medium text-fg-secondary">{{ label }}</span>
    <span class="relative inline-flex items-center">
      <select
        :value="modelValue"
        :aria-label="ariaLabel ?? label"
        class="w-full appearance-none rounded-button border border-border-strong bg-surface pr-9 text-fg transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        :class="size === 'sm' ? 'py-1.5 pl-3 text-caption' : 'py-2 pl-3 text-body-2'"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <UiIcon
        name="chevron-down"
        size="h-4 w-4"
        class="pointer-events-none absolute right-3 text-fg-muted"
      />
    </span>
  </label>
</template>
