<script setup lang="ts">
import { DEFAULT_GAME_RULES, type GameRules } from '~/utils/game-rules'
import type {
  CourtSideDto,
  EventCourtDto,
  LiveGameScore
} from '~/server/domains/event/dto/event.dto'

/**
 * One court on the live board.
 *
 * Two audiences in one card, which is why the organiser controls are a slot
 * rather than a second component: a spectator and the person at the desk are
 * looking at the same court, and splitting them into separate cards would mean
 * the score, the names and the LIVE state all had to be kept in step twice.
 */
const props = defineProps<{
  court: EventCourtDto
  /** Organiser or club staff: shows the score controls. */
  canManage: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  score: [scores: LiveGameScore[]]
  submit: []
  start: []
}>()

const isLive = computed(() => props.court.status === 'playing')

function sideLabel(side: CourtSideDto | null): string {
  if (!side || side.players.length === 0) return 'TBC'
  return side.players.map((p) => p.display_name).join(' & ')
}

/**
 * Open play is one game to 11. There is no category here to say otherwise — a
 * court belongs to an event, not a draw — so the defaults apply.
 *
 * Declared above the scoring block, which hands it to a composable and so reads
 * it during setup rather than lazily.
 */
const rules = computed<GameRules>(() => ({
  ...DEFAULT_GAME_RULES,
  bestOf: Math.max(1, (props.court.live_score ?? []).length)
}))

/**
 * A point is added by replacing the last game in the list, not by mutating it.
 * The parent owns the array and sends the whole thing to the API, so handing
 * back a mutated reference would make the optimistic update indistinguishable
 * from the server's answer.
 *
 * Advancing is a consequence of finishing a game, not a separate action — there
 * used to be a "Next game" button here, which meant two divergent ways to move
 * on. But it is no longer silent either: the point that closes a game stops and
 * asks (see `useGameConfirm`), because a scorer at a court mis-taps and used to
 * lose the game to it. Taking a point back never asks; that IS the correction.
 */
const serverGames = computed(() => props.court.live_score ?? [])

const {
  displayGames,
  pending: pendingGames,
  pendingIndex,
  addPoint: adjust,
  confirm: confirmGame,
  cancel: cancelGame
} = useGameConfirm(rules, serverGames, (games) => emit('score', games))

/**
 * The game in progress — the last one entered, or a fresh 0-0.
 *
 * Reads `displayGames`, so the board shows the tap that has just been made
 * rather than waiting for the server to agree, and shows the score being asked
 * about while a confirmation is open.
 */
const currentGame = computed<LiveGameScore>(
  () =>
    displayGames.value[displayGames.value.length - 1] ?? {
      game_number: 1,
      team1_score: 0,
      team2_score: 0
    }
)

/**
 * Whether the game is in its two-clear-points tail, and what to say about it.
 *
 * Null when it does not apply. Only meaningful while the margin rule is on —
 * with it off, reaching the target ends the game and there is no tail.
 */
const deuceNote = computed(() => {
  const game = currentGame.value
  const a = game.team1_score
  const b = game.team2_score
  if (!rules.value.winByTwo) return null
  if (Math.max(a, b) < rules.value.targetPoints - 1) return null
  if (Math.abs(a - b) >= 2) return null
  if (a === b) return `Deuce at ${a}-${b} — the game runs on until someone leads by two.`
  const leader = a > b ? sideLabel(props.court.team1) : sideLabel(props.court.team2)
  return `Game point — ${leader} needs one more clear point.`
})
</script>

<template>
  <article
    class="rounded-card bg-surface p-4 shadow-card transition-colors"
    :class="isLive ? 'ring-1 ring-danger/30' : ''"
  >
    <header class="flex items-center justify-between gap-2">
      <h3 class="font-semibold text-fg">
        {{ court.court_name || `Court ${court.court_number}` }}
      </h3>

      <!-- The LIVE label. Red, and the only red thing on the card, so it reads
           as a state rather than as decoration. -->
      <span
        v-if="isLive"
        class="inline-flex items-center gap-1.5 rounded-pill bg-danger/15 px-2 py-0.5 text-caption font-semibold uppercase tracking-wide text-danger"
      >
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
        Live
      </span>
      <span v-else class="text-caption capitalize text-fg-muted">{{ court.status }}</span>
    </header>

    <!-- In play -->
    <div v-if="isLive" class="mt-3">
      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <p class="min-w-0 truncate text-body-2 text-fg">{{ sideLabel(court.team1) }}</p>
        <p class="text-center text-heading-3 font-bold tabular-nums text-fg">
          {{ currentGame.team1_score }}<span class="mx-1 text-fg-muted">-</span
          >{{ currentGame.team2_score }}
        </p>
        <p class="min-w-0 truncate text-right text-body-2 text-fg">{{ sideLabel(court.team2) }}</p>
      </div>

      <p
        v-if="displayGames.length > 1"
        class="mt-1 text-center text-caption text-fg-muted"
      >
        Game {{ currentGame.game_number }} ·
        {{
          displayGames
            .slice(0, -1)
            .map((g) => `${g.team1_score}-${g.team2_score}`)
            .join(', ')
        }}
      </p>

      <!-- Organiser controls -->
      <div v-if="canManage" class="mt-4 space-y-2">
        <!--
          SC-7. Nothing here said what the panel was for or which game it was
          on, so an operator could not tell whether their taps were reaching
          anybody or which game they were affecting.
        -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-caption text-fg-muted">
            Points go to the live scoreboard as you tap. You confirm the final score of each game.
          </p>
          <span
            class="rounded-badge bg-warning-soft px-2 py-0.5 font-mono text-caption font-bold text-warning"
          >
            GAME {{ currentGame.game_number }}
          </span>
        </div>

        <!-- Deuce is the one state where "first to 11" stops being true, and an
             operator who does not know it is on will call the game early. -->
        <p v-if="deuceNote" class="rounded-button bg-warning-soft px-3 py-1.5 text-caption font-medium text-warning">
          {{ deuceNote }}
        </p>

        <div class="grid grid-cols-2 gap-2">
          <div class="flex items-center justify-center gap-2">
            <button
              type="button"
              class="h-9 w-9 rounded-button border border-border-strong text-fg-secondary transition-colors hover:border-primary disabled:opacity-50"
              :disabled="busy"
              :aria-label="`Remove a point from ${sideLabel(court.team1)}`"
              @click="adjust(1, -1)"
            >
              −
            </button>
            <button
              type="button"
              class="h-9 flex-1 rounded-button bg-primary text-body-2 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
              :disabled="busy"
              :aria-label="`Add a point for ${sideLabel(court.team1)}`"
              @click="adjust(1, 1)"
            >
              +1
            </button>
          </div>
          <div class="flex items-center justify-center gap-2">
            <button
              type="button"
              class="h-9 w-9 rounded-button border border-border-strong text-fg-secondary transition-colors hover:border-primary disabled:opacity-50"
              :disabled="busy"
              :aria-label="`Remove a point from ${sideLabel(court.team2)}`"
              @click="adjust(2, -1)"
            >
              −
            </button>
            <button
              type="button"
              class="h-9 flex-1 rounded-button bg-primary text-body-2 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
              :disabled="busy"
              :aria-label="`Add a point for ${sideLabel(court.team2)}`"
              @click="adjust(2, 1)"
            >
              +1
            </button>
          </div>
        </div>

        <div class="flex gap-2">
          <UiButton size="sm" full-width :disabled="busy" @click="emit('submit')">
            {{ busy ? 'Submitting…' : 'Submit final score' }}
          </UiButton>
        </div>
      </div>
    </div>

    <!-- Free -->
    <div v-else class="mt-3">
      <p class="text-body-2 text-fg-muted">No game on this court.</p>
      <UiButton v-if="canManage" size="sm" class="mt-3" :disabled="busy" @click="emit('start')">
        Start a game
      </UiButton>
    </div>

    <!-- Up next. Shown to everybody: "am I on soon?" is the question a player
         standing by the fence is actually asking. -->
    <div v-if="court.up_next.length" class="mt-4 border-t border-border pt-3">
      <p class="text-caption font-semibold uppercase tracking-wide text-fg-muted">Up next</p>
      <ol class="mt-1.5 space-y-1">
        <li
          v-for="(side, index) in court.up_next"
          :key="side.queue_id"
          class="flex items-baseline gap-2 text-body-2 text-fg-secondary"
        >
          <span class="text-caption tabular-nums text-fg-muted">{{ index + 1 }}.</span>
          <span class="min-w-0 truncate">{{ sideLabel(side) }}</span>
        </li>
      </ol>
    </div>
    <!-- Only reachable for an organiser, since only they can add a point. -->
    <MatchGameConfirmDialog
      :model-value="pendingGames !== null"
      :game-index="pendingIndex"
      :teams="[
        court.team1?.players.map((p) => p.display_name) ?? ['TBC'],
        court.team2?.players.map((p) => p.display_name) ?? ['TBC']
      ]"
      :team1-score="currentGame.team1_score"
      :team2-score="currentGame.team2_score"
      @confirm="confirmGame"
      @cancel="cancelGame"
      @update:model-value="!$event && cancelGame()"
    />
  </article>
</template>
