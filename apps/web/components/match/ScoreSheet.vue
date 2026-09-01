<script setup lang="ts">
import {
  gameWinner,
  isGameLive,
  liveGameIndex,
  seriesWinner,
  type GameRules,
  type GameScore,
  type MatchResultType
} from '~/utils/game-rules'

/**
 * The paper score sheet, typed.
 *
 * One row per side, one column per game, the winner marked on the row — the
 * same shape as the printed sheet, and the same component whether it is being
 * filled in or read back. That is the point: entry, the match view and the
 * spectator boxscore all showed a result differently before, so the same match
 * looked like three different things depending where you saw it.
 *
 * The grid is generated from the category's rules, so an open play session
 * (one game) and a best-of-five final use this with no special-casing. Nothing
 * about scoring is decided here — every rule comes from `utils/game-rules.ts`,
 * which the server validates against too.
 */
const props = withDefaults(
  defineProps<{
    /** Players per side, one name per line. Index 0 is team 1. */
    teams: [string[], string[]]
    /** Sub-label under each side — category, seeding, whatever the caller has. */
    subtitles?: [string, string] | null
    games: GameScore[]
    rules: GameRules
    /** Read-only renders the same grid without inputs. */
    readonly?: boolean
    resultType?: MatchResultType
    /** Winner when the score cannot name one (a walkover). */
    explicitWinner?: 1 | 2 | null
  }>(),
  {
    subtitles: null,
    readonly: false,
    resultType: 'normal',
    explicitWinner: null
  }
)

const emit = defineEmits<{ 'update:games': [GameScore[]] }>()

const liveIndex = computed(() => liveGameIndex(props.games, props.rules))

/**
 * The winner shown on the W/L chips.
 *
 * A normal match is decided by its games. An abandoned one cannot be, so the
 * caller's explicit winner stands in — that is what makes a DQ recordable at
 * all (SC-3).
 */
const winner = computed(() => {
  const fromScore = seriesWinner(props.games, props.rules)
  if (fromScore) return fromScore
  return props.resultType === 'normal' ? null : props.explicitWinner
})

function cellState(index: number, side: 1 | 2) {
  if (!isGameLive(props.games, index, props.rules)) return 'locked'
  if (index === liveIndex.value) return 'live'
  return gameWinner(props.games[index], props.rules) === side ? 'won' : 'idle'
}

function scoreFor(index: number, side: 1 | 2): number | null {
  const game = props.games[index]
  return side === 1 ? game.team1_score : game.team2_score
}

function setScore(index: number, side: 1 | 2, raw: string) {
  const parsed = raw === '' ? null : Math.max(0, Math.min(99, Number(raw)))
  const next = props.games.map((game, i) =>
    i === index
      ? { ...game, [side === 1 ? 'team1_score' : 'team2_score']: parsed }
      : game
  )
  emit('update:games', next as GameScore[])
}
</script>

<template>
  <!-- Its own scroller: a best-of-five on a phone is wider than the viewport,
       and the page body must never scroll sideways because of it. -->
  <div class="overflow-x-auto">
    <table class="w-full min-w-[22rem] border-separate border-spacing-0">
      <thead>
        <tr>
          <th class="pb-2 text-left text-caption uppercase tracking-wider text-fg-muted">
            Players
          </th>
          <th
            v-for="(_, i) in games"
            :key="`h-${i}`"
            class="w-16 pb-2 text-center text-caption uppercase tracking-wider text-fg-muted"
          >
            G{{ i + 1 }}
          </th>
          <th class="w-16 pb-2 text-center text-caption uppercase tracking-wider text-fg-muted">
            Result
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="side in ([1, 2] as const)" :key="side">
          <!-- Partners stack, one name per line: a doubles pair joined onto one
               line is the first thing to be truncated in a narrow column, and a
               cut-off name is the same problem as showing an id. -->
          <td
            class="border border-r-0 border-border bg-canvas px-3 py-2.5 align-middle"
            :class="side === 1 ? 'rounded-tl-card border-b-0' : 'rounded-bl-card'"
          >
            <div v-for="name in teams[side - 1]" :key="name" class="text-sm font-medium text-fg">
              {{ name }}
            </div>
            <div v-if="subtitles" class="mt-0.5 text-caption text-fg-muted">
              {{ subtitles[side - 1] }}
            </div>
          </td>

          <td
            v-for="(_, i) in games"
            :key="`${side}-${i}`"
            class="border border-r-0 border-border text-center align-middle"
            :class="[
              side === 1 ? 'border-b-0' : '',
              {
                'bg-canvas': cellState(i, side) === 'idle',
                'bg-warning-soft': cellState(i, side) === 'live',
                'bg-surface-2': cellState(i, side) === 'locked',
                'bg-primary-soft': cellState(i, side) === 'won'
              }
            ]"
          >
            <span
              v-if="readonly"
              class="block px-1 py-3 font-mono text-lg font-bold tabular-nums"
              :class="
                gameWinner(games[i], rules) === side ? 'text-fg' : 'text-fg-muted'
              "
            >
              {{ scoreFor(i, side) ?? '–' }}
            </span>
            <input
              v-else
              type="number"
              inputmode="numeric"
              min="0"
              max="99"
              :value="scoreFor(i, side) ?? ''"
              :disabled="!isGameLive(games, i, rules)"
              :aria-label="`${teams[side - 1].join(' and ')}, game ${i + 1}`"
              :title="
                isGameLive(games, i, rules)
                  ? undefined
                  : 'The match was already won before this game.'
              "
              class="w-full bg-transparent px-1 py-3 text-center font-mono text-lg font-bold tabular-nums text-fg outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:text-fg-muted"
              @input="setScore(i, side, ($event.target as HTMLInputElement).value)"
            />
          </td>

          <td
            class="border border-border bg-canvas text-center align-middle"
            :class="side === 1 ? 'rounded-tr-card border-b-0' : 'rounded-br-card'"
          >
            <span
              v-if="winner"
              class="inline-block rounded-md px-2.5 py-1 font-mono text-xs font-bold"
              :class="
                winner === side
                  ? 'bg-primary text-on-primary'
                  : 'bg-danger-soft text-danger'
              "
            >
              {{ winner === side ? 'W' : 'L' }}
            </span>
            <span v-else class="font-mono text-xs text-fg-muted">–</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
