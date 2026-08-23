<script setup lang="ts">
/**
 * "Something went wrong / Please try again later." + Try Again, from the
 * mockup's UX-patterns panel.
 *
 * `onRetry` is required, not optional: an error state with no way out is a dead
 * end, and every place the mockup shows this it shows the button too.
 */

withDefaults(
  defineProps<{
    title?: string
    message?: string
    /** Underlying error text. Shown collapsed — useful in dev, noise in prod. */
    detail?: string | null
    retryLabel?: string
    compact?: boolean
  }>(),
  {
    title: 'Something went wrong',
    message: 'Please try again later.',
    detail: null,
    retryLabel: 'Try Again',
    compact: false
  }
)

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    class="flex flex-col items-center justify-center rounded-card border border-danger/30 bg-danger/5 text-center"
    :class="compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12'"
    role="alert"
  >
    <span class="flex items-center justify-center rounded-full bg-danger/10 p-3 text-danger">
      <UiIcon name="alert" :size="compact ? 'h-5 w-5' : 'h-6 w-6'" :stroke-width="2" />
    </span>

    <p class="font-display text-heading-3 text-fg">{{ title }}</p>
    <p class="max-w-sm text-body-2 text-fg-secondary">{{ message }}</p>

    <details v-if="detail" class="mt-1 max-w-full">
      <summary class="cursor-pointer text-caption text-fg-muted">Details</summary>
      <pre class="scroll-x mt-1 whitespace-pre-wrap text-left text-caption text-fg-muted">{{ detail }}</pre>
    </details>

    <UiButton variant="secondary" size="sm" class="mt-1" @click="emit('retry')">
      <UiIcon name="refresh" size="h-4 w-4" />
      {{ retryLabel }}
    </UiButton>
  </div>
</template>
