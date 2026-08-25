<script setup lang="ts">
import type { BracketParticipantDto, BracketRoundDto } from '~/server/domains/event/dto/bracket.dto'
import { bracketGridRows, roundLabel } from '~/utils/bracket-rounds'

/**
 * A knockout draw, drawn as a draw.
 *
 * The geometry is stated, not inferred. Each round is a CSS grid over the same
 * number of leaf rows, and a match in round *i* spans `2^i` of them, centred in
 * its band. That makes every card's centre exact — independent of how tall the
 * card is, whether there is a gap, or whether the round has an odd count.
 *
 * The previous version distributed matches with `justify-around` and assumed
 * that placed the two feeders of a slot at exactly 25% and 75% of their pair.
 * It does not, and four separate things exploited the gap:
 *
 *  1. `gap-3` between the flex children moved every centre by `gap/4`;
 *  2. cards are not equal height — a bye carries an extra line, a card with set
 *     scores is taller than one without — and `space-around` centres by FREE
 *     space, so unequal children shifted the fractions further;
 *  3. the losers bracket does not halve (an 8-draw emits 2, 2, 1, 1), so
 *     pairing two-at-a-time drew joiners into rounds with two slots, not one;
 *  4. an odd match count left a lone node whose horizontal stub ran into empty
 *     space — `:has(:only-child)` hid the vertical joiner but not that.
 *
 * `bracketGridRows` also reports whether the rounds actually form a tree. When
 * they do not — a losers bracket, a round robin — the lines are left off rather
 * than drawn somewhere plausible and wrong.
 */
const props = defineProps<{
  rounds: BracketRoundDto[]
  statusConfig: Record<string, { bg: string; border: string }>
  /** The decided winner of the last round, if there is one. */
  champion?: BracketParticipantDto | null
  /** A losers draw crowns nobody, so it asks for the panel to be left off. */
  showChampion?: boolean
}>()

const ordered = computed(() => [...props.rounds].sort((a, b) => a.round - b.round))

const grid = computed(() => bracketGridRows(ordered.value.map((r) => r.matches.length)))

interface Column {
  round: number
  label: string
  matches: BracketRoundDto['matches']
  /** Grid rows one match of this round occupies. */
  span: number
  isLast: boolean
}

const columns = computed<Column[]>(() =>
  ordered.value.map((round, index) => ({
    round: round.round,
    label: roundLabel(round.round),
    matches: [...round.matches].sort((a, b) => a.position - b.position),
    span: grid.value.spans[index] ?? 1,
    isLast: index === ordered.value.length - 1
  }))
)

const championLine = computed(() => {
  const champion = props.champion
  if (!champion) return null
  return champion.partner_display_name
    ? `${champion.display_name} / ${champion.partner_display_name}`
    : champion.display_name
})
</script>

<template>
  <div class="scroll-x">
    <div
      class="bracket-tree flex items-stretch pb-4"
      :class="grid.connected ? 'bracket-tree--connected' : ''"
      :style="{ '--rows': grid.rows }"
    >
      <div
        v-for="column in columns"
        :key="column.round"
        class="bracket-round flex min-w-[15rem] flex-1 flex-col"
        :class="column.isLast ? '' : 'bracket-round--feeding'"
      >
        <h4 class="mb-3 text-xs font-medium uppercase tracking-wide text-fg-muted">
          {{ column.label }}
        </h4>

        <!-- One grid, shared row count, so a match's centre is arithmetic
             rather than a consequence of how tall its card happened to be. -->
        <div class="bracket-grid flex-1">
          <div
            v-for="match in column.matches"
            :key="match.id"
            class="bracket-node"
            :style="{ gridRow: `span ${column.span}` }"
          >
            <BracketMatchCard :match="match" :status-config="statusConfig" dense />
          </div>
        </div>
      </div>

      <!-- The point of the whole diagram. Present from the moment the draw is
           made, naming nobody until the final is decided, so the shape of the
           bracket reads as leading somewhere. -->
      <div
        v-if="showChampion"
        class="bracket-champion flex min-w-[12rem] flex-col justify-center pl-2"
      >
        <div
          class="rounded-xl border-2 p-4 text-center"
          :class="
            championLine
              ? 'border-primary bg-primary/10'
              : 'border-dashed border-border-strong bg-canvas'
          "
        >
          <UiIcon name="trophy" size="h-7 w-7" class="mx-auto text-primary" />
          <p class="mt-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">Champion</p>
          <p v-if="championLine" class="mt-1 break-words text-sm font-semibold text-fg">
            {{ championLine }}
          </p>
          <p v-else class="mt-1 text-sm text-fg-muted">To be decided</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * `--elbow` is the width of the connector zone reserved on the right of every
 * feeding round: half carries each node's stub out to the vertical joiner, half
 * carries the joined line on to the next round.
 */
.bracket-tree {
  --elbow: 1.75rem;
  --line: 2px;
}

/*
 * Equal rows, no gap. The gap is what used to move every centre off the
 * fraction the connectors assumed, so separation is the card's own padding
 * instead of layout space between cells.
 */
.bracket-grid {
  display: grid;
  grid-template-rows: repeat(var(--rows), 1fr);
}

/* The card sits centred in whatever band its row span gives it. */
.bracket-node {
  display: flex;
  align-items: center;
  padding: 0.25rem 0;
  position: relative;
}

.bracket-node > * {
  width: 100%;
}

/* Lines are drawn only for rounds that genuinely feed each other. */
.bracket-tree--connected .bracket-round--feeding {
  padding-right: calc(var(--elbow) * 2);
}

/* Out of each node to the vertical joiner. */
.bracket-tree--connected .bracket-round--feeding .bracket-node::after {
  content: '';
  position: absolute;
  left: 100%;
  top: 50%;
  width: var(--elbow);
  border-top: var(--line) solid rgb(var(--dnl-border-strong));
}

/*
 * The joiner and the line on to the next round, hung off ODD nodes only: each
 * odd node is the top half of a pair, and its own cell plus the one below it is
 * exactly the band the next round's slot occupies. `height: 100%` therefore
 * spans from this node's centre to its partner's, with no fraction assumed.
 */
.bracket-tree--connected .bracket-round--feeding .bracket-node:nth-child(odd)::before {
  content: '';
  position: absolute;
  left: calc(100% + var(--elbow));
  top: 50%;
  height: 100%;
  border-left: var(--line) solid rgb(var(--dnl-border-strong));
}

/*
 * A trailing lone node — an odd match count — has no partner to meet, so it
 * gets no joiner. Drawing one would run into empty space, which is precisely
 * what the old `:only-child` rule only half-fixed.
 */
.bracket-tree--connected .bracket-round--feeding .bracket-node:nth-child(odd):last-child::before {
  display: none;
}

/*
 * And on into the next round. Hung off the EVEN node at `top: 0` — the boundary
 * between the pair's two cells, which is exactly the midpoint of the joiner
 * above, and exactly the centre of the slot this pair feeds. No fraction is
 * assumed anywhere: it falls out of the two cells being equal, which the grid
 * guarantees.
 */
.bracket-tree--connected .bracket-round--feeding .bracket-node:nth-child(even)::before {
  content: '';
  position: absolute;
  left: calc(100% + var(--elbow));
  top: 0;
  width: var(--elbow);
  border-top: var(--line) solid rgb(var(--dnl-border-strong));
}
</style>
