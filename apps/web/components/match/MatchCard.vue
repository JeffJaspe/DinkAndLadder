<script setup lang="ts">
import type { BoxScoreMatch } from '~/components/match/BoxScore.vue'
import { playerLines } from '~/utils/player-line'
import { DEFAULT_GAME_RULES, gameWinner, seriesWinner, type GameRules } from '~/utils/game-rules'

/**
 * One match, collapsed to a line and opened to its score sheet.
 *
 * The Scores panel used to be a wide table with a row per side and a MATCH
 * column of stacked names — legible at a desk, unreadable on a phone, and it
 * showed every match at full height whether or not anybody cared about it. This
 * is the shape the draw already uses (see TournamentCategoryMatchRow): the line
 * answers "who played and how did it end", and opening it shows the sheet the
 * result was entered on, so a score reads identically wherever it is seen.
 *
 * A live match is the exception to all of that. It opens itself, it says LIVE,
 * it carries the running score on the line, and it glows — the glow is a
 * blurred, pulsing copy of the card behind the card, because a ring alone
 * disappears among a column of other cards on a venue screen.
 */
const props = withDefaults(
  defineProps<{
    match: BoxScoreMatch
    /** Force the sheet open. Live matches open themselves regardless. */
    defaultOpen?: boolean
  }>(),
  { defaultOpen: false }
)

const isLive = computed(() => props.match.liveGame != null)

const rules = computed<GameRules>(
  () =>
    props.match.rules ?? {
      ...DEFAULT_GAME_RULES,
      bestOf: Math.max(1, props.match.games.length)
    }
)

/**
 * The recorded winner where the source knows one, derived only as a fallback.
 * See BoxScoreMatch.winner: deriving it applies win-by-two, which leaves an
 * 11-10 game — a house "first to 11" — with no winner at all.
 */
const winner = computed(() => props.match.winner ?? seriesWinner(props.match.games, rules.value))

/** "Ana Garcia / Ben Cruz", for the collapsed line only — the sheet lists them. */
function sideLabel(side: 1 | 2): string {
  const names = playerLines(props.match.teams[side - 1]).map((p) => p.name)
  return names.length ? names.join(' / ') : 'TBC'
}

/** The game being played, for the score on the collapsed line. */
const currentGame = computed(() => {
  if (!isLive.value) return null
  return props.match.games[props.match.liveGame! - 1] ?? props.match.games.at(-1) ?? null
})

/**
 * The score on the collapsed line, live or finished.
 *
 * Only a live match used to show one, so a finished result had to be opened to
 * be read. In open play that is the whole content of the row: a session is a
 * long run of one-game matches between partners who change every round, and
 * making somebody expand each one to see 11–7 turns a scannable list into
 * twenty clicks.
 *
 * A single game shows its points, because that IS the result. Several games
 * show games won, because the points of game two say nothing about who won the
 * match.
 */
const lineScore = computed(() => {
  if (currentGame.value) {
    return `${currentGame.value.team1_score}–${currentGame.value.team2_score}`
  }

  const games = props.match.games
  if (games.length === 0) return null
  if (games.length === 1) return `${games[0].team1_score}–${games[0].team2_score}`

  const won = games.reduce(
    (tally, game) => {
      const by = gameWinner(game, rules.value)
      if (by === 1) tally[0] += 1
      else if (by === 2) tally[1] += 1
      return tally
    },
    [0, 0]
  )
  return `${won[0]}–${won[1]}`
})

const state = computed(() => {
  if (isLive.value) return { label: `Live · G${props.match.liveGame}`, live: true }
  if (props.match.complete || winner.value) {
    return {
      label: props.match.resultNote ? `Final · ${props.match.resultNote}` : 'Final',
      live: false
    }
  }
  return { label: 'Ready', live: false }
})

const open = ref(props.defaultOpen || isLive.value)

/** A match that goes live while somebody is reading the page opens itself. */
watch(isLive, (live) => {
  if (live) open.value = true
})
</script>

<template>
  <div class="relative">
    <!-- The glow. Purely decorative and behind everything, so it never eats a
         click or reaches a screen reader. -->
    <div
      v-if="isLive"
      class="pointer-events-none absolute -inset-1 animate-pulse rounded-card bg-danger/25 blur-md"
      aria-hidden="true"
    />

    <section
      class="relative overflow-hidden rounded-card border bg-surface transition-shadow"
      :class="isLive ? 'border-danger/50 shadow-card-hover' : 'border-border shadow-card'"
    >
      <button
        type="button"
        class="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        :aria-expanded="open"
        @click="open = !open"
      >
        <span class="min-w-0 flex-1 text-body-2 text-fg">
          <span :class="winner === 1 ? 'font-semibold' : ''">{{ sideLabel(1) }}</span>
          <span class="text-fg-muted"> vs </span>
          <span :class="winner === 2 ? 'font-semibold' : ''">{{ sideLabel(2) }}</span>
        </span>

        <!-- The running score on the collapsed line: a spectator should not
             have to open anything to see it. -->
        <span v-if="lineScore" class="text-body-1 font-bold tabular-nums text-fg">
          {{ lineScore }}
        </span>

        <span
          class="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2 py-0.5 text-caption font-semibold uppercase tracking-wide"
          :class="state.live ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-fg-muted'"
        >
          <span
            v-if="state.live"
            class="h-1.5 w-1.5 animate-pulse rounded-full bg-danger"
            aria-hidden="true"
          />
          {{ state.label }}
        </span>

        <UiIcon
          :name="open ? 'chevron-up' : 'chevron-down'"
          size="h-4 w-4"
          class="shrink-0 text-fg-muted"
        />
      </button>

      <!-- v-show, not v-if: a match reopened while its score is ticking should
           come back instantly and keep the sheet it already built. -->
      <div v-show="open" class="space-y-3 border-t border-border px-4 pb-4 pt-3">
        <p v-if="match.context" class="text-caption text-fg-muted">{{ match.context }}</p>

        <MatchScoreSheet
          v-if="match.games.length"
          readonly
          :teams="match.teams"
          :games="match.games"
          :rules="rules"
          :explicit-winner="match.winner ?? null"
        />
        <p v-else class="text-body-2 text-fg-muted">No score recorded yet.</p>
      </div>
    </section>
  </div>
</template>
