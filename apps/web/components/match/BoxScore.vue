<script setup lang="ts">
import {
  DEFAULT_GAME_RULES,
  gameWinner,
  seriesWinner,
  type GameRules,
  type GameScore
} from '~/utils/game-rules'

/**
 * Every match in one table, the way a tennis broadcast shows a round.
 *
 * Live scores existed only inside a category, so a spectator watching the whole
 * tournament had nowhere to look — they had to open each category in turn and
 * hold the picture in their head. This sits below the event header and
 * aggregates across every category.
 *
 * Read-only by construction: it takes no callbacks and emits nothing. The
 * scoring rules come from `utils/game-rules.ts`, the same module the entry
 * sheet uses, so a result reads identically wherever it appears.
 */
export interface BoxScoreMatch {
  id: string
  /** Players per side, one name per line. */
  teams: [string[], string[]]
  games: GameScore[]
  /** Category, round, court — whatever places this match. */
  context?: string | null
  /**
   * Which card this match belongs on, e.g. "Round 2" or "On court".
   *
   * A tournament is read a round at a time — "who is still in after the
   * quarters" is one question, not eight — so matches sharing a group are drawn
   * as one card with a heading. Matches with no group fall together into a
   * single untitled card, which is what a plain open-play event gets.
   */
  group?: string | null
  /** Which game is being played right now, 1-based. Null when not live. */
  liveGame?: number | null
  complete?: boolean
  /** Shown beside the state when a match did not play out. */
  resultNote?: string | null
  rules?: GameRules
}

const props = withDefaults(
  defineProps<{
    matches: BoxScoreMatch[]
    /** Columns to draw. Enough for the longest match, so every row lines up. */
    maxGames?: number
  }>(),
  { maxGames: 0 }
)

/**
 * One column count for the whole table, not per row.
 *
 * Per-row columns would mean a best-of-three and a single game rendering
 * different widths, and nothing lining up down the page — which is most of what
 * made the old per-category view hard to read at a glance.
 */
const columns = computed(() => {
  const longest = props.matches.reduce((most, m) => Math.max(most, m.games.length), 0)
  return Math.max(props.maxGames, longest, 1)
})

function rulesFor(match: BoxScoreMatch): GameRules {
  return match.rules ?? { ...DEFAULT_GAME_RULES, bestOf: Math.max(1, match.games.length) }
}

function scoreAt(match: BoxScoreMatch, index: number, side: 1 | 2): string {
  const game = match.games[index]
  if (!game) return '–'
  const value = side === 1 ? game.team1_score : game.team2_score
  return value == null ? '–' : String(value)
}

function wonGame(match: BoxScoreMatch, index: number, side: 1 | 2): boolean {
  const game = match.games[index]
  return !!game && gameWinner(game, rulesFor(match)) === side
}

function isLiveColumn(match: BoxScoreMatch, index: number): boolean {
  return match.liveGame != null && match.liveGame === index + 1
}

function winnerOf(match: BoxScoreMatch): 1 | 2 | null {
  return seriesWinner(match.games, rulesFor(match))
}

/**
 * The matches split into cards, in the order they were handed over.
 *
 * Insertion order rather than a sort: the caller knows whether the live round
 * belongs above the finished ones, and re-sorting here would fight it.
 */
const groups = computed(() => {
  const byLabel = new Map<string, BoxScoreMatch[]>()
  for (const match of props.matches) {
    const label = match.group ?? ''
    const bucket = byLabel.get(label)
    if (bucket) bucket.push(match)
    else byLabel.set(label, [match])
  }
  return [...byLabel.entries()].map(([label, matches]) => ({ label, matches }))
})

/** A card is live when any match on it is being played right now. */
function groupIsLive(matches: BoxScoreMatch[]): boolean {
  return matches.some((match) => match.liveGame != null)
}

function stateOf(match: BoxScoreMatch) {
  if (match.liveGame != null) {
    return { label: `Live · G${match.liveGame}`, tone: 'bg-warning-fill text-fg' }
  }
  if (match.complete || winnerOf(match)) {
    return {
      label: match.resultNote ? `Final · ${match.resultNote}` : 'Final',
      tone: 'bg-primary-soft text-primary'
    }
  }
  return { label: 'Ready', tone: 'bg-surface-2 text-fg-muted' }
}
</script>

<template>
  <div v-if="matches.length" class="space-y-4">
    <!-- One card per round, because a round is the unit a tournament is read
         in. A card with a match in play is banded live, so the round being
         played is findable without scanning every row's state. -->
    <div
      v-for="bucket in groups"
      :key="bucket.label || 'all'"
      class="overflow-hidden rounded-card border bg-surface"
      :class="groupIsLive(bucket.matches) ? 'border-warning/40' : 'border-border'"
    >
      <div
        v-if="bucket.label"
        class="flex items-center gap-2 border-b px-4 py-2"
        :class="groupIsLive(bucket.matches) ? 'border-warning/40 bg-warning-soft' : 'border-border bg-surface-2'"
      >
        <span
          class="text-caption font-semibold uppercase tracking-wider"
          :class="groupIsLive(bucket.matches) ? 'text-warning' : 'text-fg-muted'"
        >
          {{ bucket.label }}
        </span>
        <span
          v-if="groupIsLive(bucket.matches)"
          class="inline-flex items-center gap-1.5 rounded-pill bg-danger/15 px-2 py-0.5 text-caption font-semibold uppercase tracking-wide text-danger"
        >
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
          Live
        </span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[36rem] border-collapse text-sm">
      <thead>
        <tr>
          <th
            class="border-b border-border bg-surface-2 px-4 py-2.5 text-left text-caption uppercase tracking-wider text-fg-muted"
          >
            Match
          </th>
          <th
            v-for="i in columns"
            :key="`col-${i}`"
            class="w-14 border-b border-border bg-surface-2 px-2 py-2.5 text-center text-caption uppercase tracking-wider text-fg-muted"
          >
            G{{ i }}
          </th>
          <th
            class="border-b border-border bg-surface-2 px-4 py-2.5 text-center text-caption uppercase tracking-wider text-fg-muted"
          >
            State
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="match in bucket.matches" :key="match.id">
          <tr v-for="side in ([1, 2] as const)" :key="`${match.id}-${side}`">
            <td
              class="px-4 align-top"
              :class="side === 1 ? 'pt-3' : 'border-b border-border pb-3'"
            >
              <!-- One player per line: a doubles pair joined onto one line is
                   the first thing to be truncated in a narrow column. -->
              <div
                v-for="name in match.teams[side - 1]"
                :key="name"
                class="font-medium leading-snug"
                :class="winnerOf(match) === side ? 'text-fg' : 'text-fg-secondary'"
              >
                {{ name
                }}<span v-if="winnerOf(match) === side" class="ml-1 font-bold text-primary">✓</span>
              </div>
              <div v-if="side === 1 && match.context" class="mt-0.5 text-caption text-fg-muted">
                {{ match.context }}
              </div>
            </td>

            <td
              v-for="i in columns"
              :key="`${match.id}-${side}-${i}`"
              class="px-2 text-center align-middle"
              :class="side === 1 ? 'pt-3' : 'border-b border-border pb-3'"
            >
              <span
                class="inline-block rounded-badge px-1.5 font-mono font-bold tabular-nums"
                :class="{
                  'bg-warning-soft text-warning': isLiveColumn(match, i - 1),
                  'text-fg': !isLiveColumn(match, i - 1) && wonGame(match, i - 1, side),
                  'text-fg-muted': !isLiveColumn(match, i - 1) && !wonGame(match, i - 1, side)
                }"
              >
                {{ scoreAt(match, i - 1, side) }}
              </span>
            </td>

            <td
              v-if="side === 1"
              rowspan="2"
              class="border-b border-border px-4 text-center align-middle"
            >
              <span
                class="inline-block whitespace-nowrap rounded-badge px-2 py-0.5 text-caption font-bold uppercase tracking-wide"
                :class="stateOf(match).tone"
              >
                {{ stateOf(match).label }}
              </span>
            </td>
          </tr>
        </template>
      </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
