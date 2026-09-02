<script setup lang="ts">
import type { BoxScoreMatch } from '~/components/match/BoxScore.vue'

/**
 * One category's slice of the Scores panel.
 *
 * The panel used to be a flat run of round cards. On a weekend with four
 * categories that reads as one undifferentiated column of tables — a spectator
 * looking for "who won the 3.5 singles" has to recognise the names to work out
 * which draw a card belongs to, and a finished category takes up as much room
 * as the one being played.
 *
 * So a category that has crowned somebody collapses to a trophy: the champion's
 * name is the heading, and the scores that produced it are one click away.
 * Anything still being played stays open, because that is what people are here
 * for.
 */
const props = withDefaults(
  defineProps<{
    /** The category name. Null renders the matches bare — open play, live courts. */
    label?: string | null
    /** "Ana Garcia / Ben Cruz". Null while the final is undecided. */
    champion?: string | null
    matches: BoxScoreMatch[]
    /** Start expanded even though it is wrapped up — the only category, say. */
    defaultOpen?: boolean
  }>(),
  { label: null, champion: null, defaultOpen: false }
)

/** Wrapped up is "somebody won it", not "the last match happens to be over". */
const wrappedUp = computed(() => !!props.label && !!props.champion)

const open = ref(props.defaultOpen || !wrappedUp.value)

/** A category that finishes while somebody is reading it should not slam shut. */
watch(wrappedUp, (value) => {
  if (!value) open.value = true
})

const matchCount = computed(() => props.matches.length)
</script>

<template>
  <!-- No heading at all: open play and the live court board, which are already
       captioned by their own round cards. -->
  <MatchBoxScore v-if="!label" :matches="matches" />

  <section
    v-else-if="wrappedUp"
    class="overflow-hidden rounded-card border border-warning-fill/40 bg-surface shadow-card"
  >
    <button
      type="button"
      class="flex w-full items-center gap-4 bg-gradient-to-r from-warning-soft to-surface px-4 py-4 text-left transition-colors hover:from-warning-soft hover:to-warning-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-fill sm:px-5"
      :aria-expanded="open"
      @click="open = !open"
    >
      <!-- The medallion. A trophy on a gold disc reads as a result from across
           a room, which is the distance a venue screen is read from. -->
      <span
        class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-warning-fill to-warning shadow-card ring-4 ring-warning-fill/20"
      >
        <UiIcon name="trophy" size="h-6 w-6" :stroke-width="2" class="text-on-accent" />
      </span>

      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-2">
          <span class="truncate text-caption font-semibold uppercase tracking-wider text-fg-muted">
            {{ label }}
          </span>
          <span
            class="shrink-0 rounded-pill bg-warning-fill/15 px-2 py-0.5 text-caption font-bold uppercase tracking-wide text-warning"
          >
            Champion
          </span>
        </span>
        <span class="mt-0.5 block break-words font-display text-heading-3 leading-tight text-fg">
          {{ champion }}
        </span>
      </span>

      <span class="flex shrink-0 items-center gap-1.5 text-caption font-medium text-fg-muted">
        <span class="hidden sm:inline">{{ open ? 'Hide' : 'Scores' }} · {{ matchCount }}</span>
        <UiIcon :name="open ? 'chevron-up' : 'chevron-down'" size="h-4 w-4" />
      </span>
    </button>

    <!-- v-show, not v-if: reopening a finished category should be instant, and
         the tables are already built. -->
    <div v-show="open" class="space-y-4 border-t border-border bg-canvas p-3 sm:p-4">
      <MatchBoxScore :matches="matches" />
    </div>
  </section>

  <!-- Still being played: named, never folded away. -->
  <section v-else class="space-y-2">
    <h3 class="flex items-center gap-2 px-0.5">
      <span class="font-display text-body-1 font-semibold text-fg">{{ label }}</span>
      <span class="text-caption text-fg-muted">· {{ matchCount }} played</span>
    </h3>
    <MatchBoxScore :matches="matches" />
  </section>
</template>
