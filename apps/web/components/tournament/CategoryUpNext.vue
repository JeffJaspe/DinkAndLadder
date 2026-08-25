<script setup lang="ts">
import type { BracketDto } from '~/server/domains/event/dto/bracket.dto'
import { nextMatch, participantLabel } from '~/utils/bracket-schedule'
import { roundLabel } from '~/utils/bracket-rounds'

/**
 * One line answering the only question a player has walking into a venue:
 * am I on, and if not, who is?
 *
 * Lives on the COLLAPSED category card, so it has to be legible without opening
 * anything. That is the whole reason the page loads every category's draw at
 * once rather than fetching one when a card opens.
 */
const props = defineProps<{
  bracket: BracketDto | null
  loading?: boolean
}>()

const entry = computed(() => nextMatch(props.bracket))
const onCourt = computed(() => entry.value?.match.status === 'in_progress')

const hasDraw = computed(() => (props.bracket?.rounds ?? []).some((r) => r.matches.length))

const label = computed(() => {
  if (!entry.value) return null
  const m = entry.value.match
  return `${participantLabel(m, 1)} vs ${participantLabel(m, 2)}`
})

/** Distinguishes "not drawn yet" from "drawn, but nothing can start". */
const emptyMessage = computed(() => {
  if (!hasDraw.value) return 'No draw yet'
  return 'Waiting on earlier results'
})
</script>

<template>
  <p v-if="loading" class="h-4 w-48 animate-pulse rounded bg-surface-2" />

  <p v-else-if="entry" class="flex flex-wrap items-center gap-x-2 text-sm">
    <span
      class="h-1.5 w-1.5 shrink-0 rounded-full"
      :class="onCourt ? 'bg-primary' : 'bg-fg-muted'"
    />
    <span class="text-fg-muted">{{ onCourt ? 'On court' : 'Next' }}:</span>
    <span class="min-w-0 text-fg">{{ label }}</span>
    <span class="text-xs text-fg-muted">{{ roundLabel(entry.round) }}</span>
  </p>

  <p v-else class="text-sm text-fg-muted">{{ emptyMessage }}</p>
</template>
