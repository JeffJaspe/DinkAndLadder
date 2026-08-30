<script setup lang="ts">
/**
 * Back affordance + title for detail pages.
 *
 * Every detail page hand-rolled its own back link — `clubs/[clubId]`,
 * `events/[eventId]`, `matches/[matchId]`, `matches/submit`,
 * `players/[playerId]/head-to-head` — each with different wording, placement
 * and styling, and several of them buried at the bottom of an error state
 * where nobody looks. There was no Breadcrumb, BackButton or PageHeader
 * component to reach for.
 *
 * Back goes to real browser history when there is any, so it returns you to
 * the list you actually came from — filters, scroll position and all — rather
 * than to a hardcoded index. `to` is the fallback for a deep link, a fresh tab
 * or an external referrer, where `router.back()` would leave the app entirely.
 */
const props = withDefaults(
  defineProps<{
    /** Where Back goes when there is no in-app history to return to. */
    to: string
    /** Label for that fallback, e.g. "Events". Also the accessible name. */
    backLabel?: string
    title?: string
    subtitle?: string
  }>(),
  { backLabel: 'Back', title: undefined, subtitle: undefined }
)

const router = useRouter()

/**
 * Nuxt seeds history with the entry the app booted on, so a length of 1 means
 * this page *is* the entry point and there is nothing of ours to go back to.
 */
function goBack() {
  if (import.meta.client && window.history.length > 1) {
    router.back()
    return
  }
  navigateTo(props.to)
}
</script>

<template>
  <div class="mb-4">
    <button
      type="button"
      class="-ml-2 inline-flex items-center gap-1.5 rounded-button px-2 py-1.5 text-body-2 text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg"
      @click="goBack"
    >
      <UiIcon name="arrow-left" size="h-4 w-4" :stroke-width="2" />
      {{ backLabel }}
    </button>

    <div v-if="title || $slots.actions" class="mt-2 flex items-start justify-between gap-4">
      <div v-if="title" class="min-w-0">
        <h1 class="truncate text-xl font-bold text-fg lg:text-2xl">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1 text-body-2 text-fg-muted">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="shrink-0">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
