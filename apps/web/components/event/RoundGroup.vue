<script setup lang="ts">
/**
 * One wave of play, with how far through it the session is.
 *
 * The progress badge is the reason this is a component rather than a heading:
 * "0/2 done" answers the question a player at the fence is actually asking -
 * how long until the next round - and it can only be counted where the round's
 * matches are already gathered together.
 */
const props = defineProps<{
  /** Null for games recorded before rounds existed, or entered by hand. */
  round: number | null
  done: number
  total: number
}>()

const complete = computed(() => props.total > 0 && props.done >= props.total)

const title = computed(() => (props.round === null ? 'Other matches' : `Round ${props.round}`))
</script>

<template>
  <section>
    <div class="mb-3 flex items-center gap-2.5">
      <UiIcon
        :name="complete ? 'check' : 'paddle'"
        size="h-4 w-4"
        :class="complete ? 'text-success' : 'text-warning'"
      />
      <h3 class="font-display text-heading-3 text-fg">{{ title }}</h3>

      <span
        v-if="total > 0"
        class="rounded-pill px-2.5 py-0.5 text-caption font-semibold"
        :class="complete ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'"
      >
        {{ complete ? 'Complete' : `${done}/${total} done` }}
      </span>
    </div>

    <!-- Rows, not a grid. A match row is read left to right - side, score,
         side - and two of them side by side halves the width each one has for
         four names while doubling the number of places the eye has to track. -->
    <div class="space-y-2">
      <slot />
    </div>
  </section>
</template>
