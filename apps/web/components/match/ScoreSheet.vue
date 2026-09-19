<script setup lang="ts">
import { playerLines, type PlayerLine } from '~/utils/player-line'
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
 * (one game) and a best-of-five final use this with no special-casing. The one
 * concession to the short case is the column heading: "G1" over a lone column
 * labels a breakdown that does not exist, so a single-game match calls it
 * "Score", which is what it is. Nothing
 * about scoring is decided here — every rule comes from `utils/game-rules.ts`,
 * which the server validates against too.
 */
const props = withDefaults(
  defineProps<{
    /**
     * Players per side, one name per line. Index 0 is team 1.
     *
     * Pass ids alongside the names and each becomes a link to that profile;
     * pass bare strings where a link would be wrong — the submit form, where a
     * tap on a name would navigate out of a half-filled entry.
     */
    teams: [PlayerLine[], PlayerLine[]]
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
    i === index ? { ...game, [side === 1 ? 'team1_score' : 'team2_score']: parsed } : game
  )
  emit('update:games', next as GameScore[])
}

/** "G2" reads fine with a neighbour; alone it is just "Score" — see the header. */
function gameLabel(index: number): string {
  return props.games.length === 1 ? 'score' : `game ${index + 1}`
}

/** Names only, joined for an aria-label. A side can be a doubles pair of objects. */
function sideLabel(side: 1 | 2): string {
  return playerLines(props.teams[side - 1])
    .map((p) => p.name)
    .join(' and ')
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
            class="pb-2 text-center text-caption uppercase tracking-wider text-fg-muted"
            :class="readonly ? 'w-16' : 'w-28'"
          >
            <span class="inline-flex items-center gap-1.5">
              <!-- The one column still open for entry, so the eye lands on it
                   without reading every header. -->
              <span
                v-if="!readonly && i === liveIndex"
                class="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-warning"
                aria-hidden="true"
              />
              {{ games.length === 1 ? 'Score' : `G${i + 1}` }}
            </span>
          </th>
          <th class="w-16 pb-2 text-center text-caption uppercase tracking-wider text-fg-muted">
            Result
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="side in [1, 2] as const" :key="side">
          <!-- Partners stack, one name per line: a doubles pair joined onto one
               line is the first thing to be truncated in a narrow column, and a
               cut-off name is the same problem as showing an id. -->
          <td
            class="relative border border-r-0 border-border bg-canvas px-3 py-2.5 align-middle"
            :class="side === 1 ? 'rounded-tl-card border-b-0' : 'rounded-bl-card'"
          >
            <div
              v-for="player in playerLines(teams[side - 1])"
              :key="player.name"
              class="text-sm font-medium text-fg"
            >
              <UiPlayerLink
                :player-id="player.playerId"
                :name="player.name"
                avatar
                avatar-size="xs"
              />
            </div>
            <div v-if="subtitles" class="mt-0.5 text-caption text-fg-muted">
              {{ subtitles[side - 1] }}
            </div>

            <!-- The two rows are one match, not two entries in a list. A small
                 VS mark sits on the hairline between them — filled in, mid-game
                 or read back after the fact — so the sheet reads as a
                 head-to-head at a glance instead of a spreadsheet of names. -->
            <span
              v-if="side === 1"
              class="pointer-events-none absolute inset-x-0 -bottom-2.5 z-10 flex justify-center"
            >
              <span
                class="rounded-pill border border-border-strong bg-surface px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-widest text-fg-muted shadow-card"
              >
                vs
              </span>
            </span>
          </td>

          <td
            v-for="(_, i) in games"
            :key="`${side}-${i}`"
            class="border border-r-0 border-border text-center align-middle"
            :class="[
              side === 1 ? 'border-b-0' : '',
              readonly ? 'w-16' : 'w-28',
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
              :class="gameWinner(games[i], rules) === side ? 'text-fg' : 'text-fg-muted'"
            >
              {{ scoreFor(i, side) ?? '–' }}
            </span>

            <!-- Steppers, not a bare number field: typing a score courtside,
                 one-handed, is the app's highest-friction input (docs/33 §5.7).
                 A tap the thumb cannot miss beats a keyboard the wind is
                 fighting, and it makes an invalid score unreachable rather than
                 merely rejected. -->
            <div v-else class="flex justify-center px-1 py-1.5">
              <UiStepper
                :model-value="scoreFor(i, side) ?? 0"
                :disabled="!isGameLive(games, i, rules)"
                :label="`${sideLabel(side)}, ${gameLabel(i)}`"
                @update:model-value="setScore(i, side, String($event))"
              />
            </div>
          </td>

          <td
            class="border border-border bg-canvas text-center align-middle"
            :class="side === 1 ? 'rounded-tr-card border-b-0' : 'rounded-br-card'"
          >
            <span
              v-if="winner"
              class="inline-block rounded-md px-2.5 py-1 font-mono text-xs font-bold"
              :class="winner === side ? 'bg-primary text-on-primary' : 'bg-danger-soft text-danger'"
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
