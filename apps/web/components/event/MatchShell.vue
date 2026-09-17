<script setup lang="ts">
/**
 * The shape every match on the live board takes, whatever state it is in.
 *
 * The board used to render a game two completely different ways depending on
 * whether it had finished: a live court was a card with a score and controls,
 * a finished game was a row in a list on another tab. Same four people, same
 * court, same evening - and nothing about the two presentations rhymed, so
 * following one match from "on court" to "final" meant re-reading the screen
 * from scratch.
 *
 * So the arrangement is fixed here and the state only changes the trim: court
 * chip top-left, status top-right, the two sides either end of a `vs`, and
 * whatever the state has to say underneath. A match stays in the same place on
 * the card as it moves through the evening.
 *
 * Presentational on purpose - it holds no score, no queue and no permissions.
 * `CourtCard` and `ResultCard` bring those.
 */
import type { CourtSideDto } from '~/server/domains/event/dto/event.dto'

type ShellStatus = 'playing' | 'done' | 'open'

const props = withDefaults(
  defineProps<{
    courtNumber: number | null
    courtName?: string | null
    status: ShellStatus
    /**
     * Which side won, once somebody has. Highlighting is the fastest way to
     * read a finished card - the eye lands on the green before the numbers.
     */
    winner?: 1 | 2 | null
    /** Names for each side. A side with nobody on it renders as TBC. */
    side1: CourtSideDto | null
    side2: CourtSideDto | null
    /** The scoring page: names scale up with the score. See CourtCard. */
    wide?: boolean
  }>(),
  { courtName: null, winner: null, wide: false }
)

/**
 * Null when there is no court to name, so the chip is not rendered at all.
 *
 * A finished match does not record where it was played, so this used to fall
 * back to the bare word "Court" - a chip that took up the same room as a real
 * one and told you nothing.
 */
const courtLabel = computed(
  () => props.courtName || (props.courtNumber !== null ? `Court ${props.courtNumber}` : null)
)

/**
 * One entry per player so each name can be its own profile link.
 *
 * Stacked rather than joined with "&": a doubles pair is two people, and at a
 * glance from the fence two short lines are read faster than one long one.
 */
function players(side: CourtSideDto | null) {
  if (!side || side.players.length === 0) return [{ id: null, name: 'TBC' }]
  return side.players.map((p) => ({ id: p.id, name: p.display_name }))
}

const statusPill = computed(() => {
  if (props.status === 'playing') {
    return { label: 'Playing', class: 'bg-warning-soft text-warning' }
  }
  if (props.status === 'done') {
    return { label: 'Done', class: 'bg-success-soft text-success' }
  }
  return { label: 'Open', class: 'bg-surface-3 text-fg-muted' }
})

/**
 * A finished card steps back so the live ones carry the page.
 *
 * Only the losing side and the frame are dimmed, never the winner: the result
 * is the reason the card is still on screen.
 */
const isDone = computed(() => props.status === 'done')

function sideClass(side: 1 | 2) {
  if (!isDone.value) return 'text-fg'
  if (props.winner === side) return 'text-success'
  if (props.winner === null) return 'text-fg-secondary'
  return 'text-fg-muted'
}
</script>

<template>
  <article
    class="rounded-card border transition-colors"
    :class="[
      wide ? 'p-6 sm:p-8' : 'p-4',
      status === 'playing'
        ? 'border-warning/40 bg-surface'
        : status === 'done'
          ? 'border-border bg-surface/60'
          : 'border-dashed border-border-strong bg-surface/40'
    ]"
  >
    <header class="flex items-center justify-between gap-2">
      <span v-if="!courtLabel" aria-hidden="true" />
      <span
        v-if="courtLabel"
        class="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 py-1 text-caption font-semibold text-primary"
      >
        <UiIcon name="paddle" size="h-3.5 w-3.5" />
        {{ courtLabel }}
      </span>

      <span
        class="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-semibold"
        :class="statusPill.class"
      >
        <!-- The pulse is the only motion on the card, and only while a game is
             actually on, so it reads as "this is happening now". -->
        <span
          v-if="status === 'playing'"
          class="h-1.5 w-1.5 animate-pulse rounded-full bg-warning"
          aria-hidden="true"
        />
        {{ statusPill.label }}
      </span>
    </header>

    <div class="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div
        class="min-w-0 rounded-button px-2 py-1.5"
        :class="isDone && winner === 1 ? 'bg-success-soft' : ''"
      >
        <p
          v-for="(player, i) in players(side1)"
          :key="player.id ?? i"
          class="truncate font-semibold"
          :class="[sideClass(1), wide ? 'text-body-1 sm:text-heading-3' : 'text-body-2']"
        >
          <UiIcon
            v-if="isDone && winner === 1 && i === 0"
            name="trophy"
            size="h-3.5 w-3.5"
            class="mr-1 inline-block align-[-2px]"
          />
          <UiPlayerLink :player-id="player.id" :name="player.name" avatar avatar-size="xs" />
        </p>
      </div>

      <span class="text-caption font-semibold uppercase tracking-wide text-fg-muted">vs</span>

      <div
        class="min-w-0 rounded-button px-2 py-1.5 text-right"
        :class="isDone && winner === 2 ? 'bg-success-soft' : ''"
      >
        <p
          v-for="(player, i) in players(side2)"
          :key="player.id ?? i"
          class="truncate font-semibold"
          :class="[sideClass(2), wide ? 'text-body-1 sm:text-heading-3' : 'text-body-2']"
        >
          <UiIcon
            v-if="isDone && winner === 2 && i === 0"
            name="trophy"
            size="h-3.5 w-3.5"
            class="mr-1 inline-block align-[-2px]"
          />
          <UiPlayerLink :player-id="player.id" :name="player.name" />
        </p>
      </div>
    </div>

    <div v-if="$slots.default" class="mt-3 border-t border-border pt-3">
      <slot />
    </div>
  </article>
</template>
