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
const props = withDefaults(
  defineProps<{
    court: EventCourtDto
    /** Organiser or club staff: shows the score controls. */
    canManage: boolean
    busy?: boolean
    /**
     * The dedicated scoring page, where this card IS the screen.
     *
     * Scales the score and the point buttons up rather than changing what the
     * card does: at a desk the targets should be hittable without looking, and
     * on the board the same card has to sit in a row beside five others.
     */
    wide?: boolean
    /**
     * The event's scoring rules. See 054.
     *
     * Optional so a caller that has not loaded the event yet still renders a
     * live score rather than nothing, and because the defaults are exactly
     * what every session created before 054 was played to. When it is passed,
     * it is the truth: the deuce note, the confirm-on-game-point dialog and
     * the "game finished" test all read it.
     */
    rules?: Pick<GameRules, 'targetPoints' | 'winByTwo' | 'bestOf'> | null
  }>(),
  { busy: false, wide: false, rules: null }
)

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
 * The rules this court is played to.
 *
 * Open play used to be one game to 11 with no way to say otherwise, because a
 * court belongs to an event and only a tournament category could carry rules.
 * 054 put target_points, win_by_two and games_default on the event, and the
 * page passes them down; the defaults survive only as the answer for a caller
 * that has not loaded the event.
 *
 * bestOf never drops below the number of games already recorded. A session
 * switched from best-of-3 to a single game mid-evening would otherwise declare
 * its own second game impossible and refuse to submit the result.
 *
 * Declared above the scoring block, which hands it to a composable and so reads
 * it during setup rather than lazily.
 */
const rules = computed<GameRules>(() => {
  const played = (props.court.live_score ?? []).length
  const configured = props.rules
  return {
    targetPoints: configured?.targetPoints ?? DEFAULT_GAME_RULES.targetPoints,
    winByTwo: configured?.winByTwo ?? DEFAULT_GAME_RULES.winByTwo,
    bestOf: Math.max(1, configured?.bestOf ?? DEFAULT_GAME_RULES.bestOf, played)
  }
})

/**
 * The rule in force, said once on the card.
 *
 * Now that a session can be to 15 or best of 3, "first to 11" is no longer
 * something a scorer can assume — and a scorer who assumes wrong calls the
 * game early.
 */
const rulesNote = computed(() => {
  const games = rules.value.bestOf === 1 ? 'One game' : `Best of ${rules.value.bestOf}`
  return `${games} to ${rules.value.targetPoints}${rules.value.winByTwo ? ', win by 2' : ''}`
})

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
  <EventMatchShell
    :court-number="court.court_number"
    :court-name="court.court_name"
    :status="isLive ? 'playing' : 'open'"
    :wide="wide"
    :side1="court.team1"
    :side2="court.team2"
  >
    <!-- In play -->
    <div v-if="isLive">
      <p
        class="text-center font-bold tabular-nums text-fg"
        :class="wide ? 'text-stat-md sm:text-stat-court' : 'text-heading-2'"
      >
        {{ currentGame.team1_score }}<span class="mx-2 text-fg-muted">–</span
        >{{ currentGame.team2_score }}
      </p>
      <p class="mt-1 text-center text-caption font-medium text-warning">
        In progress<span v-if="displayGames.length > 1">
          · game {{ currentGame.game_number }} ·
          {{
            displayGames
              .slice(0, -1)
              .map((g) => `${g.team1_score}-${g.team2_score}`)
              .join(', ')
          }}</span
        >
      </p>

      <!-- Organiser controls -->
      <div v-if="canManage" class="mt-4 space-y-2 border-t border-border pt-3">
        <!--
          SC-7. Nothing here said what the panel was for or which game it was
          on, so an operator could not tell whether their taps were reaching
          anybody or which game they were affecting.
        -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-caption text-fg-muted">
            Points go to the live scoreboard as you tap. You confirm the final score of each game.
          </p>
          <span class="flex shrink-0 items-center gap-1.5">
            <!-- The rule, next to the game it applies to. A scorer who thinks
                 it is 11 when the club is playing 15 calls the game early. -->
            <span
              class="rounded-badge bg-surface-2 px-2 py-0.5 text-caption font-medium text-fg-secondary"
            >
              {{ rulesNote }}
            </span>
            <span
              class="rounded-badge bg-warning-soft px-2 py-0.5 font-mono text-caption font-bold text-warning"
            >
              GAME {{ currentGame.game_number }}
            </span>
          </span>
        </div>

        <!-- Deuce is the one state where "first to 11" stops being true, and an
             operator who does not know it is on will call the game early. -->
        <p
          v-if="deuceNote"
          class="rounded-button bg-warning-soft px-3 py-1.5 text-caption font-medium text-warning"
        >
          {{ deuceNote }}
        </p>

        <div class="grid grid-cols-2 gap-2">
          <div class="flex items-center justify-center gap-2">
            <button
              type="button"
              :class="[
                'rounded-button border border-border-strong text-fg-secondary transition-colors hover:border-primary disabled:opacity-50',
                wide ? 'h-14 w-14 sm:h-16 sm:w-16 text-heading-3' : 'h-11 w-11'
              ]"
              :disabled="busy"
              :aria-label="`Remove a point from ${sideLabel(court.team1)}`"
              @click="adjust(1, -1)"
            >
              −
            </button>
            <button
              type="button"
              :class="[
                'flex-1 rounded-button bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50',
                wide ? 'h-14 sm:h-16 text-heading-3' : 'h-11 text-body-1'
              ]"
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
              :class="[
                'rounded-button border border-border-strong text-fg-secondary transition-colors hover:border-primary disabled:opacity-50',
                wide ? 'h-14 w-14 sm:h-16 sm:w-16 text-heading-3' : 'h-11 w-11'
              ]"
              :disabled="busy"
              :aria-label="`Remove a point from ${sideLabel(court.team2)}`"
              @click="adjust(2, -1)"
            >
              −
            </button>
            <button
              type="button"
              :class="[
                'flex-1 rounded-button bg-primary font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50',
                wide ? 'h-14 sm:h-16 text-heading-3' : 'h-11 text-body-1'
              ]"
              :disabled="busy"
              :aria-label="`Add a point for ${sideLabel(court.team2)}`"
              @click="adjust(2, 1)"
            >
              +1
            </button>
          </div>
        </div>

        <div class="flex gap-2">
          <UiButton
            :size="wide ? 'lg' : 'md'"
            full-width
            class="min-h-11"
            :disabled="busy"
            @click="emit('submit')"
          >
            {{ busy ? 'Submitting…' : 'Submit final score' }}
          </UiButton>
        </div>
      </div>
    </div>

    <!-- Free -->
    <div v-else>
      <p class="text-center text-caption text-fg-muted">No game on this court.</p>
      <UiButton
        v-if="canManage"
        :size="wide ? 'lg' : 'md'"
        full-width
        class="mt-3 min-h-11"
        :disabled="busy"
        @click="emit('start')"
      >
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
          <!-- The queue is read at a fence, by people looking for their own
               name. `sideLabel` joined the side into one string and dropped the
               ids with it, so the one list whose whole job is "am I next" was
               the one place you could not tap yourself. -->
          <span v-if="!side.players.length" class="min-w-0 truncate">TBC</span>
          <span v-else class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            <template v-for="(player, i) in side.players" :key="player.id ?? i">
              <span v-if="i > 0" class="text-fg-muted">&amp;</span>
              <UiPlayerLink
                :player-id="player.id"
                :name="player.display_name"
                avatar
                avatar-size="xs"
              />
            </template>
          </span>
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
  </EventMatchShell>
</template>
