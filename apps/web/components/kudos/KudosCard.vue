<script setup lang="ts">
import { emptyTallies } from '~/server/domains/kudos/dto/kudos.dto'
import type { PlayerKudosDto } from '~/server/domains/kudos/dto/kudos.dto'

/**
 * What this player's opponents say they do well.
 *
 * Six fixed skills, always all six, including the zeroes. A card that listed
 * only what somebody had received would change shape per player and read as a
 * ranking of their strengths; showing the whole set makes a zero mean "nobody
 * has said this yet" rather than "this was left out".
 *
 * Bars, not numbers alone. The interesting fact is the shape — a player who is
 * all dink and no drive should look different at a glance from one who is the
 * reverse — and six numbers in a column do not carry that. Each bar is scaled
 * against the player's own top skill, not against the platform, because this is
 * a portrait rather than a league table.
 */
const props = defineProps<{
  kudos: PlayerKudosDto | null
  /** Whose card this is, for the empty state's copy. */
  displayName: string
  isOwnProfile: boolean
  /** Total matches played, for the per-game rate. */
  totalMatches?: number
}>()

/**
 * The six rows are the card's structure, so they are drawn whether or not the
 * fetch behind them arrived.
 *
 * Falling back to `[]` would have collapsed the card to a heading and a
 * sentence on any failed request — and on every request made before the
 * `match_kudos` table exists, which is the state of every environment until
 * 066 lands. A player seeing five of six skills because one row failed is a
 * worse lie than showing six zeroes.
 */
const tallies = computed(() => props.kudos?.tallies ?? emptyTallies())
const total = computed(() => props.kudos?.total ?? 0)

/** Per-game rate: kudos received divided by matches played. */
const perGame = computed(() => {
  if (!props.totalMatches || props.totalMatches === 0) return null
  return (total.value / props.totalMatches).toFixed(1)
})

/** The busiest skill, so the bars have something to scale against. */
const peak = computed(() => Math.max(1, ...tallies.value.map((t) => t.count)))
</script>

<template>
  <section class="rounded-card border border-border bg-surface p-5 shadow-card">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="font-display text-heading-3 text-fg">Kudos</h2>
      <p v-if="total" class="text-body-2 text-fg-muted">
        <span class="tabular-nums">{{ total }}</span> total<template v-if="perGame">
          · <span class="tabular-nums">{{ perGame }}</span> per game</template>
      </p>
    </div>

    <p v-if="!total" class="mt-2 max-w-prose text-body-2 text-fg-secondary">
      <template v-if="isOwnProfile">
        No kudos yet. Opponents can credit one thing you did well after a match you played is
        recorded.
      </template>
      <template v-else>
        Nobody has given {{ displayName }} kudos yet. If you play them, you can credit one thing
        they did well once the result is recorded.
      </template>
    </p>

    <p v-else class="mt-1 text-body-2 text-fg-secondary">
      What the players on the other side of the net said they did well.
    </p>

    <ul class="mt-4 space-y-2.5">
      <li v-for="tally in tallies" :key="tally.skill" class="flex items-center gap-3">
        <span class="w-6 shrink-0 text-center text-base leading-none" aria-hidden="true">{{
          tally.icon
        }}</span>

        <span class="w-32 shrink-0 text-body-2" :class="tally.count ? 'text-fg' : 'text-fg-muted'">
          {{ tally.label }}
        </span>

        <!-- The track is always drawn, so an unearned skill reads as an empty
             measure rather than a missing row. -->
        <span class="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-3">
          <span
            v-if="tally.count"
            class="block h-full rounded-pill bg-primary"
            :style="{ width: `${Math.round((tally.count / peak) * 100)}%` }"
          />
        </span>

        <span
          class="w-6 shrink-0 text-right text-body-2 tabular-nums"
          :class="tally.count ? 'font-medium text-fg' : 'text-fg-muted'"
        >
          {{ tally.count }}
        </span>
      </li>
    </ul>
  </section>
</template>
