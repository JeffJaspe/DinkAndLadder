<script setup lang="ts">
import { describeLimit, isUnlimited } from '~/utils/subscription-plan'

/**
 * "1 of 1 live tournaments" — a limit with its usage beside it.
 *
 * A limit shown alone makes a club owner go looking for what counts against
 * it; the usage next to it is the useful sentence. At or over the ceiling the
 * tone is `warning`, never `danger`: nothing is broken, the club has simply
 * used what its plan allows.
 */
const props = defineProps<{
  label: string
  used: number
  /** `null` is unlimited. Never -1. */
  limit: number | null
  noun: string
  pluralNoun?: string
}>()

const unlimited = computed(() => isUnlimited(props.limit))
const atLimit = computed(() => !unlimited.value && props.used >= (props.limit as number))
const ratio = computed(() => {
  if (unlimited.value) return 0
  const cap = props.limit as number
  if (cap === 0) return 1
  return Math.min(1, props.used / cap)
})
const limitText = computed(() => describeLimit(props.limit, props.noun, props.pluralNoun))
</script>

<template>
  <div class="rounded-lg border border-border p-3" :class="atLimit ? 'bg-warning-soft/40' : ''">
    <div class="flex items-baseline justify-between gap-3">
      <span class="text-sm text-fg">{{ label }}</span>
      <span class="text-sm tabular-nums" :class="atLimit ? 'font-medium text-warning' : 'text-fg-secondary'">
        <template v-if="unlimited">{{ used }} · Unlimited</template>
        <template v-else>{{ used }} of {{ limit }}</template>
      </span>
    </div>
    <div
      v-if="!unlimited"
      class="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-2"
      role="meter"
      :aria-valuemin="0"
      :aria-valuemax="limit ?? undefined"
      :aria-valuenow="used"
      :aria-label="`${label}: ${used} of ${limit}`"
    >
      <div
        class="h-full rounded-pill transition-[width]"
        :class="atLimit ? 'bg-warning' : 'bg-primary'"
        :style="{ width: `${ratio * 100}%` }"
      />
    </div>
    <p class="mt-1.5 text-xs text-fg-muted">
      {{ limitText }} on this plan.
      <template v-if="atLimit"> Nothing has been cancelled; upgrade to run more at once.</template>
    </p>
  </div>
</template>
