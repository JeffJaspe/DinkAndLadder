<script setup lang="ts">
import type { BoxScoreMatch } from '~/components/match/BoxScore.vue'
import { playerLines } from '~/utils/player-line'
import {
  DEFAULT_GAME_RULES,
  gamesWon,
  seriesWinner,
  type GameRules,
  type GameScore
} from '~/utils/game-rules'

/**
 * One match, the way a venue screen shows it.
 *
 * The Scores panel on a tournament page listed every recorded result as a
 * column of collapsed cards, so the one thing a spectator walked up to read —
 * what is the score on court RIGHT NOW — was a line of 14px text somewhere in
 * a list, and the finished results around it were a repeat of what every
 * category card already shows. This is one match and nothing else: the two
 * sides either side of a score set large enough to read from the next court,
 * and the same two-row sheet the result was entered on underneath it, so the
 * game-by-game breakdown is there without opening anything.
 *
 * Read-only by construction. What the number means comes from
 * `utils/game-rules.ts`, the same module the entry sheet and the server use,
 * so the board cannot disagree with the sheet under it.
 */
const props = withDefaults(
  defineProps<{
    match: BoxScoreMatch
    /**
     * Where the rest of this match's draw lives — the category card, as a
     * route string. The board shows one match; the button is how a reader
     * gets from it to the bracket it belongs to. Null when the match sits in
     * no category (open play, a hand-recorded result).
     */
    categoryTo?: string | null
  }>(),
  { categoryTo: null }
)

/**
 * The category button was pressed. The link itself navigates; this is for the
 * caller that owns the page and knows whether the card is already open, in
 * which case navigating changes nothing and it should scroll instead.
 */
const emit = defineEmits<{ viewCategory: [] }>()

const isLive = computed(() => props.match.liveGame != null)

const rules = computed<GameRules>(
  () =>
    props.match.rules ?? {
      ...DEFAULT_GAME_RULES,
      bestOf: Math.max(1, props.match.games.length)
    }
)

/**
 * The games on the sheet. A match that has just been started has no score
 * yet, and a board that says LIVE with nothing under it reads as broken, so a
 * live match with no games is shown at 0–0 in game one.
 */
const sheetGames = computed<GameScore[]>(() =>
  props.match.games.length || !isLive.value
    ? props.match.games
    : [{ team1_score: 0, team2_score: 0 }]
)

/** The recorded winner where the source knows one, derived only as a fallback. */
const winner = computed(() => props.match.winner ?? seriesWinner(props.match.games, rules.value))

/** The game being played: the one the source points at, else the last. */
const currentGame = computed<GameScore | null>(() => {
  if (!isLive.value) return null
  const pointed = props.match.liveGame ? sheetGames.value[props.match.liveGame - 1] : undefined
  return pointed ?? sheetGames.value[sheetGames.value.length - 1] ?? null
})

const won = computed(() => gamesWon(props.match.games, rules.value))

/**
 * The big number.
 *
 * Live, it is the points of the game in progress — that is what the room is
 * watching. Finished, a single game shows its points because that IS the
 * result, and several games show games won, because the points of game two
 * say nothing about who took the match. The sheet underneath carries the
 * per-game detail either way.
 */
const bigScore = computed<[number, number]>(() => {
  if (currentGame.value) {
    return [currentGame.value.team1_score ?? 0, currentGame.value.team2_score ?? 0]
  }
  const games = props.match.games
  if (games.length === 1) return [games[0].team1_score ?? 0, games[0].team2_score ?? 0]
  return won.value
})

/** What the big number is counting, when that is not obvious. */
const scoreNote = computed(() => {
  const bestOf = rules.value.bestOf
  if (isLive.value) {
    return bestOf > 1
      ? `Game ${props.match.liveGame} · games ${won.value[0]}–${won.value[1]}`
      : `To ${rules.value.targetPoints}${rules.value.winByTwo ? ', win by two' : ''}`
  }
  if (props.match.games.length > 1) {
    return `Games · ${props.match.games
      .map((g) => `${g.team1_score ?? 0}–${g.team2_score ?? 0}`)
      .join(', ')}`
  }
  return null
})

const state = computed(() => {
  if (isLive.value) return { label: 'Live', live: true }
  if (props.match.complete || winner.value) {
    return {
      label: props.match.resultNote ? `Final · ${props.match.resultNote}` : 'Final',
      live: false
    }
  }
  return { label: 'Ready', live: false }
})

function lines(side: 1 | 2) {
  const names = playerLines(props.match.teams[side - 1])
  return names.length ? names : [{ name: 'TBC', playerId: null }]
}

/** Whether a side's name should read as the winner's. */
function wonBy(side: 1 | 2) {
  return !isLive.value && winner.value === side
}

/** Whether a side's name should recede as the loser's. */
function lostBy(side: 1 | 2) {
  return !isLive.value && winner.value != null && winner.value !== side
}

function nameTone(side: 1 | 2) {
  if (wonBy(side)) return 'font-semibold text-fg'
  if (lostBy(side)) return 'text-fg-secondary'
  return 'text-fg'
}
</script>

<template>
  <section
    class="overflow-hidden rounded-card border bg-surface shadow-card"
    :class="isLive ? 'border-danger/50' : 'border-border'"
    data-testid="scoreboard"
  >
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-6">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <p
          class="min-w-0 truncate text-caption font-semibold uppercase tracking-wider text-fg-muted"
        >
          {{ match.context || 'Match' }}
        </p>
        <span
          class="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2 py-0.5 text-caption font-semibold uppercase tracking-wide"
          :class="state.live ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg-muted'"
        >
          <span
            v-if="state.live"
            class="h-1.5 w-1.5 animate-pulse rounded-full bg-danger"
            aria-hidden="true"
          />
          {{ state.label }}
        </span>
      </div>
      <!-- From this one match to the draw it belongs to. -->
      <UiButton
        v-if="categoryTo"
        :to="categoryTo"
        size="sm"
        variant="secondary"
        @click="emit('viewCategory')"
      >
        View category
      </UiButton>
    </div>

    <!-- The board: names either side of the number from `sm`. On a phone the
         number drops beneath the two names instead — three columns at 390px
         left a doubles pair wrapping one word per line beside it — and each
         side keeps its edge, so 9 still belongs to the name on the left. -->
    <div
      class="grid grid-cols-2 items-center gap-x-3 px-4 py-5 sm:grid-cols-[1fr_auto_1fr] sm:gap-x-8 sm:px-6 sm:py-7"
    >
      <div class="min-w-0 text-left sm:text-right">
        <p
          v-for="(player, index) in lines(1)"
          :key="player.name"
          class="break-words font-display text-body-1 leading-tight sm:text-heading-3"
          :class="nameTone(1)"
        >
          <UiPlayerLink :player-id="player.playerId" :name="player.name" />
          <!-- The winner's mark rides the first name line, so the two name
               blocks stay the same height and the score stays level. -->
          <UiIcon
            v-if="index === 0 && wonBy(1)"
            name="check"
            size="h-4 w-4"
            :stroke-width="2.4"
            class="ml-1 inline-block align-[-2px] text-primary"
            label="Won"
          />
        </p>
      </div>

      <div class="col-span-2 order-last mt-4 text-center sm:order-none sm:col-span-1 sm:mt-0">
        <p
          class="whitespace-nowrap font-display text-stat-lg tabular-nums text-fg sm:text-stat-xl"
          :aria-live="isLive ? 'polite' : undefined"
        >
          <span :class="!isLive && winner === 2 ? 'text-fg-secondary' : ''">{{ bigScore[0] }}</span>
          <span class="mx-1 font-medium text-fg-muted sm:mx-2" aria-hidden="true">–</span>
          <span class="sr-only"> to </span>
          <span :class="!isLive && winner === 1 ? 'text-fg-secondary' : ''">{{ bigScore[1] }}</span>
        </p>
        <p v-if="scoreNote" class="mt-2 text-caption tabular-nums text-fg-muted">
          {{ scoreNote }}
        </p>
      </div>

      <div class="min-w-0 text-right sm:text-left">
        <p
          v-for="(player, index) in lines(2)"
          :key="player.name"
          class="break-words font-display text-body-1 leading-tight sm:text-heading-3"
          :class="nameTone(2)"
        >
          <UiIcon
            v-if="index === 0 && wonBy(2)"
            name="check"
            size="h-4 w-4"
            :stroke-width="2.4"
            class="mr-1 inline-block align-[-2px] text-primary"
            label="Won"
          />
          <UiPlayerLink :player-id="player.playerId" :name="player.name" />
        </p>
      </div>
    </div>

    <!-- The two-row sheet. Same component the result was entered on, so the
         breakdown reads identically here, on the draw and on the match page. -->
    <div class="border-t border-border bg-canvas px-4 py-3 sm:px-6 sm:py-4">
      <MatchScoreSheet
        v-if="sheetGames.length"
        readonly
        :teams="match.teams"
        :games="sheetGames"
        :rules="rules"
        :explicit-winner="match.winner ?? null"
      />
      <p v-else class="text-body-2 text-fg-muted">No score recorded yet.</p>
    </div>
  </section>
</template>
