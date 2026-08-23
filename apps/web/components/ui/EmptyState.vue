<script setup lang="ts">
/**
 * "No matches yet / Play your first match to start your journey! / Submit Match"
 * from the mockup's UX-patterns panel.
 *
 * Every empty state in the mockups carries an action, so `title` and `message`
 * are required and the CTA is strongly encouraged — an empty screen that only
 * says "nothing here" tells the user they are stuck rather than what to do next.
 */
import type { IconName } from '~/utils/icons'

withDefaults(
  defineProps<{
    title: string
    message: string
    icon?: IconName
    /** CTA label. Omit only where the user genuinely cannot act. */
    actionLabel?: string | null
    /** Route for the CTA. Without it the CTA emits `action` instead. */
    actionTo?: string | null
    compact?: boolean
  }>(),
  { icon: 'paddle', actionLabel: null, actionTo: null, compact: false }
)

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div
    class="flex flex-col items-center justify-center rounded-card border border-dashed border-border text-center"
    :class="compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12'"
  >
    <span class="flex items-center justify-center rounded-full bg-surface-2 p-3 text-fg-muted">
      <UiIcon :name="icon" :size="compact ? 'h-5 w-5' : 'h-6 w-6'" />
    </span>

    <p class="font-display text-heading-3 text-fg">{{ title }}</p>
    <p class="max-w-sm text-body-2 text-fg-secondary">{{ message }}</p>

    <UiButton
      v-if="actionLabel"
      :to="actionTo ?? undefined"
      size="sm"
      class="mt-1"
      @click="!actionTo && emit('action')"
    >
      {{ actionLabel }}
    </UiButton>
  </div>
</template>
